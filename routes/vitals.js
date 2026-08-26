const express = require('express');
const router = express.Router();
const Vitals = require('../models/Vitals');
const HealthAlert = require('../models/HealthAlert');
const HealthMonitoringServiceEnhanced = require('../services/HealthMonitoringServiceEnhanced');
const auth = require('../middleware/auth');

// Utility
const toDayKey = (date) => new Date(date).toISOString().slice(0, 10);

// Normalizers
const normalizeBloodSugar = (bloodSugar) => {
  if (!bloodSugar) return undefined;
  if (typeof bloodSugar === 'number') {
    return { value: bloodSugar, unit: 'mg/dL', readingType: 'other', measuredAt: new Date() };
  }
  if (typeof bloodSugar === 'object' && bloodSugar.value) {
    return {
      value: Number(bloodSugar.value),
      unit: bloodSugar.unit === 'mmol/L' ? 'mmol/L' : 'mg/dL',
      readingType: bloodSugar.readingType || 'other',
      measuredAt: bloodSugar.measuredAt ? new Date(bloodSugar.measuredAt) : new Date(),
    };
  }
  return undefined;
};

const normalizeAdherenceEvents = (adherenceEvents) => {
  if (!Array.isArray(adherenceEvents)) return [];
  return adherenceEvents
    .filter((event) => event && typeof event === 'object')
    .map((event) => ({
      medicationName: event.medicationName || undefined,
      scheduledTime: event.scheduledTime || undefined,
      status: event.status || 'taken',
      notes: event.notes || undefined,
      recordedAt: event.recordedAt ? new Date(event.recordedAt) : new Date(),
    }));
};

// GET all vitals
router.get('/', auth, async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;
    const userId = req.userId;

    const vitals = await Vitals.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await Vitals.countDocuments({ user: userId });

    res.json({ vitals, pagination: { total, limit: parseInt(limit), skip: parseInt(skip) } });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET latest vitals
router.get('/latest', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const vitals = await Vitals.findOne({ user: userId }).sort({ createdAt: -1 });
    if (!vitals) return res.status(404).json({ message: 'No vitals found' });
    res.json({ vitals });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST new vitals (append to arrays)
router.post('/', auth, async (req, res) => {
  console.log("called")
  try {
    const userId = req.userId;
    const { bloodPressure, heartRate, temperature, oxygenLevel, bloodSugar, weight, symptoms, adherenceEvents, hydration, notes, source, deviceName } = req.body;
    console.log(bloodPressure, "blood pressure")
    // Build new entries
    let bpEntry;
    if (typeof bloodPressure === 'string') {
      const [systolic, diastolic] = bloodPressure.split('/').map(Number);
      bpEntry = { systolic, diastolic, raw: bloodPressure, measuredAt: new Date() };
    } else if (typeof bloodPressure === 'object') {
      bpEntry = { ...bloodPressure, measuredAt: new Date() };
    }

    const hrEntry = heartRate ? { value: heartRate, measuredAt: new Date() } : null;
    const tempEntry = temperature ? { value: temperature, measuredAt: new Date() } : null;
    const o2Entry = oxygenLevel ? { value: oxygenLevel, measuredAt: new Date() } : null;
    const sugarEntry = normalizeBloodSugar(bloodSugar);
    const weightEntry = weight ? { value: weight, measuredAt: new Date() } : null;
    const hydrationEntry = hydration ? { value: hydration, measuredAt: new Date() } : null;

    const vitals = new Vitals({
      user: userId,
      bloodPressure: bpEntry ? [bpEntry] : [],
      heartRate: hrEntry ? [hrEntry] : [],
      temperature: tempEntry ? [tempEntry] : [],
      oxygenLevel: o2Entry ? [o2Entry] : [],
      bloodSugar: sugarEntry ? [sugarEntry] : [],
      weight: weightEntry ? [weightEntry] : [],
      hydration: hydrationEntry ? [hydrationEntry] : [],
      symptoms: symptoms || [],
      adherenceEvents: normalizeAdherenceEvents(adherenceEvents),
      notes,
      source: source || 'manual',
      deviceName,
    });

    await vitals.save();

    res.status(201).json({ message: 'Vitals recorded successfully', vitals });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
    console.log(err.message)
  }
});

// PUT update vitals (append new entries)
router.put('/:id', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const vitalId = req.params.id;
    const updateData = req.body;

    const vitals = await Vitals.findById(vitalId);
    if (!vitals) return res.status(404).json({ message: 'Vitals not found' });
    if (vitals.user.toString() !== userId.toString()) return res.status(403).json({ message: 'Unauthorized' });

    if (updateData.heartRate !== undefined) {
      vitals.heartRate.push({ value: updateData.heartRate, measuredAt: new Date() });
    }
    if (updateData.temperature !== undefined) {
      vitals.temperature.push({ value: updateData.temperature, measuredAt: new Date() });
    }
    if (updateData.oxygenLevel !== undefined) {
      vitals.oxygenLevel.push({ value: updateData.oxygenLevel, measuredAt: new Date() });
    }
    if (updateData.weight !== undefined) {
      vitals.weight.push({ value: updateData.weight, measuredAt: new Date() });
    }
    if (updateData.hydration !== undefined) {
      vitals.hydration.push({ value: updateData.hydration, measuredAt: new Date() });
    } 
    console.log("money", updateData.bloodPressure)
    if (updateData.bloodPressure !== undefined) {
      let bpUpdate;
      if (typeof updateData.bloodPressure === 'string') {
        const [systolic, diastolic] = updateData.bloodPressure.split('/').map(Number);
        bpUpdate = { systolic, diastolic, raw: updateData.bloodPressure, measuredAt: new Date() };
      } else {
        bpUpdate = { ...updateData.bloodPressure, measuredAt: new Date() };
      }
      vitals.bloodPressure.push(bpUpdate);
    }
    if (updateData.bloodSugar !== undefined) {
      const sugarUpdate = normalizeBloodSugar(updateData.bloodSugar);
      if (sugarUpdate) vitals.bloodSugar.push(sugarUpdate);
    }
    if (updateData.symptoms !== undefined) {
      vitals.symptoms.push(...updateData.symptoms);
    }
    if (updateData.adherenceEvents !== undefined) {
      vitals.adherenceEvents.push(...normalizeAdherenceEvents(updateData.adherenceEvents));
    }
    if (updateData.notes !== undefined) {
      vitals.notes = updateData.notes;
    }

    await vitals.save();
    res.json({ message: 'Vitals updated successfully', vitals });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// DELETE vitals
router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const vitalId = req.params.id;
    const vitals = await Vitals.findById(vitalId);
    if (!vitals) return res.status(404).json({ message: 'Vitals not found' });
    if (vitals.user.toString() !== userId.toString()) return res.status(403).json({ message: 'Unauthorized' });
    await Vitals.findByIdAndDelete(vitalId);
    res.json({ message: 'Vitals deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
