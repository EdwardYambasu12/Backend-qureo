const express = require('express');
const router = express.Router();
const HealthAssessment = require('../models/HealthAssessment');
const auth = require('../middleware/auth');

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isLikelyDuplicatePayload(current, incoming) {
  const sameName = normalizeText(current.fullName) === normalizeText(incoming.fullName);
  const sameGoal = normalizeText(current.goal) === normalizeText(incoming.goal);
  const sameAge = normalizeNum(current.age) === normalizeNum(incoming.age);
  const sameWeight = normalizeNum(current.weightKg) === normalizeNum(incoming.weightKg ?? incoming.weight);
  const sameHeight = normalizeNum(current.heightCm) === normalizeNum(incoming.heightCm ?? incoming.height);
  const sameMood = normalizeText(current.mood) === normalizeText(incoming.mood);
  return sameName && sameGoal && sameAge && sameWeight && sameHeight && sameMood;
}

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toStringOrEmpty(value) {
  return value === null || value === undefined ? '' : String(value);
}

function normalizeMedications(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

function buildAssessmentPayload(data) {
  return {
    fullName: toStringOrEmpty(data.fullName).trim(),
    goal: toStringOrEmpty(data.goal).trim(),
    age: toNumberOrNull(data.age),
    dob: data.dob || null,
    gender: toStringOrEmpty(data.gender).trim(),
    bloodType: toStringOrEmpty(data.bloodType).trim(),
    weightKg: toNumberOrNull(data.weightKg ?? data.weight),
    heightCm: toNumberOrNull(data.heightCm ?? data.height),
    fitnessLevel: toNumberOrNull(data.fitnessLevel),
    sleepLevel: toStringOrEmpty(data.sleepLevel).trim(),
    smokeLevel: toStringOrEmpty(data.smokeLevel).trim(),
    mood: toStringOrEmpty(data.mood).trim(),
    eatingHours: toStringOrEmpty(data.eatingHours).trim(),
    medications: normalizeMedications(data.medications),
    allergy: toStringOrEmpty(data.allergy).trim(),
    condition: toStringOrEmpty(data.condition).trim(),
    checkupFrequency: toStringOrEmpty(data.checkupFrequency).trim(),
    notes: toStringOrEmpty(data.notes).trim(),
    score: toNumberOrNull(data.score),
    raw: data.raw && typeof data.raw === 'object' ? data.raw : {},
    metadata: data.metadata && typeof data.metadata === 'object' ? data.metadata : {},
  };
}

// GET /api/assessment - list assessments for the current user
router.get('/', auth, async (req, res) => {
  try {
    const latest = await HealthAssessment.findOne({ user: req.userId }).sort({ updatedAt: -1, createdAt: -1 });
    // Keep response shape compatible with frontend while enforcing single-record behavior.
    res.json({ assessments: latest ? [latest] : [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

async function upsertSingleAssessment(req, res) {
  try {
    const data = req.body || {};
    const uid = req.userId;
    const payload = buildAssessmentPayload(data);

    const existing = await HealthAssessment.findOne({ user: uid }).sort({ updatedAt: -1, createdAt: -1 });

    if (existing) {
      if (isLikelyDuplicatePayload(existing, payload)) {
        return res.status(200).json({
          assessment: existing,
          duplicate: true,
          message: 'Duplicate assessment ignored',
        });
      }

      Object.assign(existing, payload);
      await existing.save();

      // Ensure one assessment per user by cleaning stale duplicates if they exist.
      await HealthAssessment.deleteMany({ user: uid, _id: { $ne: existing._id } });

      return res.status(200).json({ assessment: existing, duplicate: false, updated: true });
    }

    const a = new HealthAssessment({ user: uid, ...payload });
    await a.save();
    return res.status(201).json({ assessment: a, duplicate: false, updated: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

// POST /api/assessment - create or update the single assessment record
router.post('/', auth, upsertSingleAssessment);

// PUT /api/assessment - explicit update endpoint (same single-record semantics)
router.put('/', auth, upsertSingleAssessment);

module.exports = router;
