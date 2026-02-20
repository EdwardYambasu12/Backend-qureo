const express = require('express');
const router = express.Router();
const Medication = require('../models/Medication');
const auth = require('../middleware/auth');

// GET all medications for user
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user._id;
    const { active } = req.query; // Filter by active status

    const query = { user: userId };
    if (active === 'true') {
      query.isActive = true;
    } else if (active === 'false') {
      query.isActive = false;
    }

    const medications = await Medication.find(query).sort({ startDate: -1 });

    res.json({
      success: true,
      medications,
      count: medications.length,
    });
  } catch (error) {
    console.error('Error fetching medications:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching medications',
      error: error.message,
    });
  }
});

// GET active medications only
router.get('/active', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user._id;

    const medications = await Medication.find({
      user: userId,
      isActive: true,
    }).sort({ startDate: -1 });

    res.json({
      success: true,
      medications,
      count: medications.length,
    });
  } catch (error) {
    console.error('Error fetching active medications:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching medications',
      error: error.message,
    });
  }
});

// GET single medication by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user._id;
    const medication = await Medication.findOne({
      _id: req.params.id,
      user: userId,
    });

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: 'Medication not found',
      });
    }

    res.json({
      success: true,
      medication,
    });
  } catch (error) {
    console.error('Error fetching medication:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching medication',
      error: error.message,
    });
  }
});

// POST create new medication
router.post('/', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user._id;
    const {
      name,
      dosage,
      frequency,
      scheduledTimes,
      prescribedBy,
      startDate,
      endDate,
      reason,
      sideEffects,
      notes,
      remindMe,
      refillsRemaining,
    } = req.body;

    // Validate required fields
    if (!name || !dosage || !frequency || !scheduledTimes || !startDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, dosage, frequency, scheduledTimes, startDate',
      });
    }

    const medication = await Medication.create({
      user: userId,
      name,
      dosage,
      frequency,
      scheduledTimes: scheduledTimes.map(time => ({
        time,
        taken: false,
        takenAt: null,
      })),
      prescribedBy,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      reason,
      sideEffects: sideEffects || [],
      notes,
      remindMe: remindMe !== false,
      refillsRemaining,
      isActive: true,
    });

    res.status(201).json({
      success: true,
      message: 'Medication added successfully',
      medication,
    });
  } catch (error) {
    console.error('Error creating medication:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating medication',
      error: error.message,
    });
  }
});

// PATCH update medication
router.patch('/:id', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user._id;
    const updateData = req.body;

    // Remove sensitive fields that shouldn't be updated directly
    delete updateData.user;
    delete updateData.createdAt;

    const medication = await Medication.findOneAndUpdate(
      { _id: req.params.id, user: userId },
      updateData,
      { new: true, runValidators: true }
    );

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: 'Medication not found',
      });
    }

    res.json({
      success: true,
      message: 'Medication updated successfully',
      medication,
    });
  } catch (error) {
    console.error('Error updating medication:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating medication',
      error: error.message,
    });
  }
});

// PATCH mark dose as taken
router.patch('/:id/mark-taken', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user._id;
    const { timeIndex } = req.body;

    if (timeIndex === undefined) {
      return res.status(400).json({
        success: false,
        message: 'timeIndex is required',
      });
    }

    const medication = await Medication.findOne({
      _id: req.params.id,
      user: userId,
    });

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: 'Medication not found',
      });
    }

    if (!medication.scheduledTimes[timeIndex]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid time index',
      });
    }

    medication.scheduledTimes[timeIndex].taken = true;
    medication.scheduledTimes[timeIndex].takenAt = new Date();
    await medication.save();

    res.json({
      success: true,
      message: 'Dose marked as taken',
      medication,
    });
  } catch (error) {
    console.error('Error marking dose as taken:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking dose',
      error: error.message,
    });
  }
});

// PATCH mark dose as not taken
router.patch('/:id/mark-untaken', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user._id;
    const { timeIndex } = req.body;

    if (timeIndex === undefined) {
      return res.status(400).json({
        success: false,
        message: 'timeIndex is required',
      });
    }

    const medication = await Medication.findOne({
      _id: req.params.id,
      user: userId,
    });

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: 'Medication not found',
      });
    }

    if (!medication.scheduledTimes[timeIndex]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid time index',
      });
    }

    medication.scheduledTimes[timeIndex].taken = false;
    medication.scheduledTimes[timeIndex].takenAt = null;
    await medication.save();

    res.json({
      success: true,
      message: 'Dose marked as not taken',
      medication,
    });
  } catch (error) {
    console.error('Error marking dose as not taken:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating dose status',
      error: error.message,
    });
  }
});

// PATCH deactivate medication
router.patch('/:id/deactivate', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user._id;

    const medication = await Medication.findOneAndUpdate(
      { _id: req.params.id, user: userId },
      { isActive: false },
      { new: true }
    );

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: 'Medication not found',
      });
    }

    res.json({
      success: true,
      message: 'Medication deactivated',
      medication,
    });
  } catch (error) {
    console.error('Error deactivating medication:', error);
    res.status(500).json({
      success: false,
      message: 'Error deactivating medication',
      error: error.message,
    });
  }
});

// PATCH reactivate medication
router.patch('/:id/reactivate', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user._id;

    const medication = await Medication.findOneAndUpdate(
      { _id: req.params.id, user: userId },
      { isActive: true },
      { new: true }
    );

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: 'Medication not found',
      });
    }

    res.json({
      success: true,
      message: 'Medication reactivated',
      medication,
    });
  } catch (error) {
    console.error('Error reactivating medication:', error);
    res.status(500).json({
      success: false,
      message: 'Error reactivating medication',
      error: error.message,
    });
  }
});

// DELETE medication
router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user._id;

    const medication = await Medication.findOneAndDelete({
      _id: req.params.id,
      user: userId,
    });

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: 'Medication not found',
      });
    }

    res.json({
      success: true,
      message: 'Medication deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting medication:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting medication',
      error: error.message,
    });
  }
});

module.exports = router;
