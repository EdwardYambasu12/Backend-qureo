const express = require('express');
const router = express.Router();
const HealthPlan = require('../models/HealthPlan');
const auth = require('../middleware/auth');
const { startOfDay, endOfDay } = require('date-fns');

// GET today's health plan for the user
router.get('/today', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user._id;
    const today = new Date();
    const dayStart = startOfDay(today);
    const dayEnd = endOfDay(today);

    let healthPlan = await HealthPlan.findOne({
      user: userId,
      planDate: {
        $gte: dayStart,
        $lte: dayEnd,
      },
    });

    // If no plan exists for today, create one
    if (!healthPlan) {
      healthPlan = await HealthPlan.create({
        user: userId,
        planDate: today,
        tasks: {
          bp: { label: 'Log Blood Pressure', completed: false },
          hydration: { label: 'Hydration Check', completed: false },
          medication: { label: 'Take Medication', completed: false },
          symptoms: { label: 'Log Symptoms', completed: false },
        },
        status: 'pending',
      });
    }

    res.json({
      success: true,
      healthPlan,
    });
  } catch (error) {
    console.error('Error fetching today health plan:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching health plan',
      error: error.message,
    });
  }
});

// GET specific health plan by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user._id;
    const healthPlan = await HealthPlan.findOne({
      _id: req.params.id,
      user: userId,
    });

    if (!healthPlan) {
      return res.status(404).json({
        success: false,
        message: 'Health plan not found',
      });
    }

    res.json({
      success: true,
      healthPlan,
    });
  } catch (error) {
    console.error('Error fetching health plan:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching health plan',
      error: error.message,
    });
  }
});

// GET all health plans for user (with pagination)
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const healthPlans = await HealthPlan.find({ user: userId })
      .sort({ planDate: -1 })
      .skip(skip)
      .limit(limit);

    const total = await HealthPlan.countDocuments({ user: userId });

    res.json({
      success: true,
      healthPlans,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching health plans:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching health plans',
      error: error.message,
    });
  }
});

// POST/UPDATE health plan (complete a task)
router.post('/:id/complete-task', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user._id;
    const { taskName } = req.body;
    const validTasks = ['bp', 'hydration', 'medication', 'symptoms'];

    if (!validTasks.includes(taskName)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid task name',
      });
    }

    const healthPlan = await HealthPlan.findOne({
      _id: req.params.id,
      user: userId,
    });

    if (!healthPlan) {
      return res.status(404).json({
        success: false,
        message: 'Health plan not found',
      });
    }

    // Mark task as completed
    healthPlan.tasks[taskName].completed = true;
    healthPlan.tasks[taskName].completedAt = new Date();

    // Update completion count
    const completedCount = Object.values(healthPlan.tasks).filter(
      (task) => task.completed
    ).length;
    healthPlan.completionCount = completedCount;
    healthPlan.completionPercentage = (completedCount / 4) * 100;

    // Update status
    if (completedCount === 4) {
      healthPlan.status = 'completed';
    } else if (completedCount > 0) {
      healthPlan.status = 'in_progress';
    }

    await healthPlan.save();

    res.json({
      success: true,
      message: `Task "${taskName}" marked as completed`,
      healthPlan,
    });
  } catch (error) {
    console.error('Error updating health plan:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating health plan',
      error: error.message,
    });
  }
});

// POST update multiple tasks at once
router.post('/:id/update-tasks', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user._id;
    const { tasks } = req.body;

    if (!tasks || typeof tasks !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Invalid tasks data',
      });
    }

    const healthPlan = await HealthPlan.findOne({
      _id: req.params.id,
      user: userId,
    });

    if (!healthPlan) {
      return res.status(404).json({
        success: false,
        message: 'Health plan not found',
      });
    }

    // Update tasks
    Object.keys(tasks).forEach((taskName) => {
      if (healthPlan.tasks[taskName]) {
        healthPlan.tasks[taskName].completed = tasks[taskName];
        if (tasks[taskName]) {
          healthPlan.tasks[taskName].completedAt = new Date();
        }
      }
    });

    // Update completion count
    const completedCount = Object.values(healthPlan.tasks).filter(
      (task) => task.completed
    ).length;
    healthPlan.completionCount = completedCount;
    healthPlan.completionPercentage = (completedCount / 4) * 100;

    // Update status
    if (completedCount === 4) {
      healthPlan.status = 'completed';
    } else if (completedCount > 0) {
      healthPlan.status = 'in_progress';
    } else {
      healthPlan.status = 'pending';
    }

    await healthPlan.save();

    res.json({
      success: true,
      message: 'Tasks updated successfully',
      healthPlan,
    });
  } catch (error) {
    console.error('Error updating health plan tasks:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating health plan',
      error: error.message,
    });
  }
});

// DELETE health plan
router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user._id;
    const healthPlan = await HealthPlan.findOneAndDelete({
      _id: req.params.id,
      user: userId,
    });

    if (!healthPlan) {
      return res.status(404).json({
        success: false,
        message: 'Health plan not found',
      });
    }

    res.json({
      success: true,
      message: 'Health plan deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting health plan:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting health plan',
      error: error.message,
    });
  }
});

module.exports = router;
