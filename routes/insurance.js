const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const InsurancePlan = require('../models/InsurancePlan');
const InsuranceSubscription = require('../models/InsuranceSubscription');
const InsuranceClaim = require('../models/InsuranceClaim');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');

// Get all insurance plans
router.get('/plans', async (req, res) => {
  try {
    // Include legacy records where isActive was never set.
    const plans = await InsurancePlan.find({ isActive: { $ne: false } })
      .sort({ monthlyPremium: 1 });

    res.json({
      success: true,
      plans
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get plan details
router.get('/plans/:id', async (req, res) => {
  try {
    const plan = await InsurancePlan.findById(req.params.id);
    
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    res.json({
      success: true,
      plan
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user subscription
router.get('/subscription', async (req, res) => {

 const {userId} = req.query;
 console.log("Fetching subscription for user:", userId);
  try {
    const subscription = await InsuranceSubscription.findOne({
      user: userId,
      status: 'active'
    }).populate('plan');

    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    res.json({
      success: true,
      subscription
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get subscription renewal reminders
router.get('/subscription/reminders', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const subscription = await InsuranceSubscription.findOne({
      user: userId,
      status: 'active',
    }).populate('plan');

    if (!subscription) {
      return res.json({
        success: true,
        reminders: [],
        renewal: null,
      });
    }

    const reminders = [];
    const now = new Date();
    const renewalDate = subscription.endDate ? new Date(subscription.endDate) : null;
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysUntilRenewal = renewalDate
      ? Math.ceil((renewalDate.getTime() - now.getTime()) / msPerDay)
      : null;

    if (renewalDate && daysUntilRenewal !== null) {
      if (daysUntilRenewal < 0) {
        reminders.push({
          type: 'expired',
          severity: 'high',
          title: 'Insurance coverage expired',
          message: `${subscription.plan?.name || 'Your plan'} expired on ${renewalDate.toLocaleDateString()}. Renew now to avoid coverage gaps.`,
          cta: 'Renew Plan',
        });
      } else if (daysUntilRenewal <= 3) {
        reminders.push({
          type: 'renewal_due_soon',
          severity: 'high',
          title: 'Renewal due very soon',
          message: `${subscription.plan?.name || 'Your plan'} renews in ${daysUntilRenewal} day${daysUntilRenewal === 1 ? '' : 's'}.`,
          cta: 'Review Plan',
        });
      } else if (daysUntilRenewal <= 7) {
        reminders.push({
          type: 'renewal_due_week',
          severity: 'medium',
          title: 'Renewal reminder',
          message: `${subscription.plan?.name || 'Your plan'} renews in ${daysUntilRenewal} days.`,
          cta: 'Manage Renewal',
        });
      } else if (daysUntilRenewal <= 14) {
        reminders.push({
          type: 'renewal_upcoming',
          severity: 'low',
          title: 'Upcoming renewal notice',
          message: `Your insurance renews on ${renewalDate.toLocaleDateString()}.`,
          cta: 'View Details',
        });
      }

      if (!subscription.autoRenew && daysUntilRenewal <= 14) {
        reminders.push({
          type: 'auto_renew_disabled',
          severity: daysUntilRenewal <= 7 ? 'high' : 'medium',
          title: 'Auto-renew is off',
          message: 'Turn on auto-renew or prepare manual payment to avoid losing coverage.',
          cta: 'Enable Auto-renew',
        });
      }
    }

    return res.json({
      success: true,
      reminders,
      renewal: {
        renewalDate,
        daysUntilRenewal,
        autoRenew: subscription.autoRenew,
        monthlyPremium: subscription.plan?.monthlyPremium || 0,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Subscribe to insurance plan
router.post('/subscribe', async (req, res) => {
  try {
    const { planId, paymentMethod } = req.body;

    const {userId} = req.query;

    console.log("Subscribing user:", userId, "to plan:", planId);
    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required' });
    }

    const plan = await InsurancePlan.findById(planId);
    if (!plan || !plan.isActive) {
      return res.status(404).json({ error: 'Plan not found or inactive' });
    }

    // Check if already subscribed
    const existingSubscription = await InsuranceSubscription.findOne({
      user: userId,
      status: 'active'
    });

    if (existingSubscription) {
      return res.status(400).json({ error: 'You already have an active subscription' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Check wallet balance
     
      const wallet = await Wallet.findOne({ user: userId }).session(session);
      console.log("User wallet:", wallet);
      if (!wallet || wallet.balance < plan.monthlyPremium) {

        console.log("Insufficient balance:", wallet ? wallet.balance : 0, "Required:", plan.monthlyPremium);
        return res.status(400).json({ 
          error: `Insufficient balance. Required: $${plan.monthlyPremium}` 
        });
      }

      // Deduct from wallet
      const previousBalance = wallet.balance;
      const newBalance = previousBalance - plan.monthlyPremium;
      
      wallet.balance = newBalance;
      wallet.lastTransaction = new Date();
      await wallet.save({ session });
      console.log("Wallet updated. New balance:", newBalance);
      // Create subscription
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);

      const subscription = new InsuranceSubscription({
        user: userId,
        plan: plan._id,
        startDate: new Date(),
        endDate,
        status: 'active',
        paymentMethod: paymentMethod || 'wallet',
        coverageUsed: {}
      });
      await subscription.save({ session });

      console.log("Subscription created:", subscription._id);

      // Create transaction
      const transaction = new Transaction({
        wallet: wallet._id,
        user: userId,
        type: 'insurance_payment',
        amount: plan.monthlyPremium,
        previousBalance,
        newBalance,
        status: 'completed',
        paymentMethod: paymentMethod || 'wallet',
        description: `Insurance premium for ${plan.name}`,
        reference: `INS-${Date.now()}`,
        completedAt: new Date()
      });
      await transaction.save({ session });

      await session.commitTransaction();
      session.endSession();

      const populatedSubscription = await InsuranceSubscription
        .findById(subscription._id)
        .populate('plan');

      res.json({
        success: true,
        message: 'Subscribed successfully',
        subscription: populatedSubscription,
        newBalance
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel subscription
router.post('/subscription/cancel', async (req, res) => {
    const userId = req.query.user
  try {
    const subscription = await InsuranceSubscription.findOne({
      user: userId,
      status: 'active'
    });
    console.log("Cancelling subscription for user:", userId, subscription ? subscription._id : "none found");

    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    subscription.status = 'cancelled';
    subscription.autoRenew = false;
    await subscription.save();

    res.json({
      success: true,
      message: 'Subscription cancelled successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update subscription
router.put('/subscription', async (req, res) => {
  try {
    const { autoRenew, paymentMethod, userId: bodyUserId } = req.body;
    const userId = req.query.userId || bodyUserId;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const subscription = await InsuranceSubscription.findOne({
      user: userId,
      status: 'active'
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    if (autoRenew !== undefined) subscription.autoRenew = Boolean(autoRenew);
    if (paymentMethod) subscription.paymentMethod = paymentMethod;

    await subscription.save();

    const populatedSubscription = await InsuranceSubscription
      .findById(subscription._id)
      .populate('plan');

    res.json({
      success: true,
      message: 'Subscription updated successfully',
      subscription: populatedSubscription
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



//Post New plan 
router.post('/plans', async (req, res) => {
  try {
    const {
      name,
      code,
      description,
      monthlyPremium,
      coverageLimit,
      coverageDetails,
      benefits
    } = req.body;

    // Basic validation
    if (!name || !code || !monthlyPremium || !coverageLimit) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields (name, code, monthlyPremium, coverageLimit)'
      });
    }

    // Check if plan code already exists
    const existingPlan = await InsurancePlan.findOne({ code });
    if (existingPlan) {
      return res.status(400).json({
        success: false,
        message: `Plan with code "${code}" already exists`
      });
    }

    // Create new plan
    const newPlan = new InsurancePlan({
      name,
      code,
      description,
      monthlyPremium: parseFloat(monthlyPremium),
      coverageLimit: parseFloat(coverageLimit),
      coverageDetails,
      benefits,
      isActive: true
    });

    await newPlan.save();

    res.status(201).json({
      success: true,
      message: 'Insurance plan created successfully',
      plan: newPlan
    });

  } catch (error) {
    console.error('Error creating plan:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating insurance plan',
      error: error.message
    });
  }
});

// Update insurance plan
router.put('/plans/:id', async (req, res) => {
  try {
    const {
      name,
      code,
      description,
      monthlyPremium,
      coverageLimit,
      coverageDetails,
      benefits,
      isActive,
    } = req.body;

    const plan = await InsurancePlan.findById(req.params.id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Insurance plan not found',
      });
    }

    if (code && code !== plan.code) {
      const existingPlan = await InsurancePlan.findOne({ code, _id: { $ne: plan._id } });
      if (existingPlan) {
        return res.status(400).json({
          success: false,
          message: `Plan with code "${code}" already exists`,
        });
      }
    }

    plan.name = name ?? plan.name;
    plan.code = code ?? plan.code;
    plan.description = description ?? plan.description;
    plan.monthlyPremium = monthlyPremium !== undefined ? parseFloat(monthlyPremium) : plan.monthlyPremium;
    plan.coverageLimit = coverageLimit !== undefined ? parseFloat(coverageLimit) : plan.coverageLimit;
    plan.coverageDetails = Array.isArray(coverageDetails) ? coverageDetails : plan.coverageDetails;
    plan.benefits = Array.isArray(benefits) ? benefits : plan.benefits;
    if (isActive !== undefined) {
      plan.isActive = !!isActive;
    }

    await plan.save();

    res.json({
      success: true,
      message: 'Insurance plan updated successfully',
      plan,
    });
  } catch (error) {
    console.error('Error updating plan:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating insurance plan',
      error: error.message,
    });
  }
});

// Delete insurance plan (soft delete)
router.delete('/plans/:id', async (req, res) => {
  try {
    const plan = await InsurancePlan.findById(req.params.id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Insurance plan not found',
      });
    }

    plan.isActive = false;
    await plan.save();

    res.json({
      success: true,
      message: 'Insurance plan deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting plan:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting insurance plan',
      error: error.message,
    });
  }
});


// Submit insurance claim
router.post('/claims', async (req, res) => {
  try {
    const {
      providerId,
      type,
      amount,
      description,
      serviceDate,
      supportingDocuments
    } = req.body;

    // Check active subscription
    const subscription = await InsuranceSubscription.findOne({
      user: req.userId,
      status: 'active'
    }).populate('plan');

    if (!subscription) {
      return res.status(400).json({ error: 'No active insurance subscription' });
    }

    // Check coverage
    const coverage = subscription.plan.coverageDetails.find(c => c.serviceType === type);
    if (!coverage) {
      return res.status(400).json({ error: 'Service type not covered' });
    }

    const claim = new InsuranceClaim({
      user: req.userId,
      subscription: subscription._id,
      provider: providerId,
      type,
      amount: parseFloat(amount),
      description,
      serviceDate: new Date(serviceDate),
      supportingDocuments: supportingDocuments || [],
      status: 'pending'
    });

    await claim.save();

    res.json({
      success: true,
      message: 'Claim submitted successfully',
      claimId: claim._id,
      estimatedProcessing: '3-5 business days'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user claims
router.get('/claims', async (req, res) => {
  try {
    const { status, limit = 10, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    const query = { user: req.userId };
    if (status) query.status = status;

    const claims = await InsuranceClaim.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('provider', 'name type')
      .populate('subscription');

    const total = await InsuranceClaim.countDocuments(query);

    res.json({
      success: true,
      claims,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get claim details
router.get('/claims/:id', async (req, res) => {
  try {
    const claim = await InsuranceClaim.findOne({
      _id: req.params.id,
      user: req.userId
    }).populate('provider subscription');

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    res.json({
      success: true,
      claim
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel claim
router.put('/claims/:id/cancel', async (req, res) => {
  try {
    const claim = await InsuranceClaim.findOne({
      _id: req.params.id,
      user: req.userId,
      status: 'pending'
    });

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found or cannot be cancelled' });
    }

    claim.status = 'cancelled';
    await claim.save();

    res.json({
      success: true,
      message: 'Claim cancelled successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get coverage details
router.get('/coverage', async (req, res) => {
  try {
    const subscription = await InsuranceSubscription.findOne({
      user: req.userId,
      status: 'active'
    }).populate('plan');

    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    const recentClaims = await InsuranceClaim.find({
      user: req.userId,
      subscription: subscription._id
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('type amount status createdAt');

    res.json({
      success: true,
      subscription: {
        plan: subscription.plan,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        status: subscription.status,
        autoRenew: subscription.autoRenew
      },
      coverageDetails: subscription.plan.coverageDetails,
      recentClaims
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check service coverage
router.post('/check-coverage', async (req, res) => {
  try {
    const { serviceType, amount } = req.body;

    const subscription = await InsuranceSubscription.findOne({
      user: req.userId,
      status: 'active'
    }).populate('plan');

    if (!subscription) {
      return res.json({
        covered: false,
        message: 'No active subscription'
      });
    }

    const coverage = subscription.plan.coverageDetails.find(c => c.serviceType === serviceType);
    
    if (!coverage) {
      return res.json({
        covered: false,
        message: 'Service not covered'
      });
    }

    const coveredAmount = amount * (coverage.coveragePercentage / 100);

    res.json({
      covered: true,
      coveragePercentage: coverage.coveragePercentage,
      coveredAmount,
      yourCost: amount - coveredAmount,
      limit: coverage.limit
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get eligible services
router.get('/coverage/eligible-services', async (req, res) => {
  try {
    const subscription = await InsuranceSubscription.findOne({
      user: req.userId,
      status: 'active'
    }).populate('plan');

    if (!subscription) {
      return res.json({
        eligible: false,
        services: []
      });
    }

    const eligibleServices = subscription.plan.coverageDetails.map(coverage => ({
      serviceType: coverage.serviceType,
      limit: coverage.limit,
      coveragePercentage: coverage.coveragePercentage,
      description: coverage.description
    }));

    res.json({
      eligible: true,
      services: eligibleServices
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;