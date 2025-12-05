// controllers/insurance.controller.js
const InsurancePlan = require('../models/InsurancePlan');
const InsuranceSubscription = require('../models/InsuranceSubscription');
const InsuranceClaim = require('../models/InsuranceClaim');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
//const Notification = require('../models/Notification');

class InsuranceController {
  // Get all insurance plans
  async getAllPlans(req, res) {
    try {
      const plans = await InsurancePlan.find({ isActive: true })
        .sort({ order: 1 })
        .select('-__v');

      res.json({
        success: true,
        data: plans
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching insurance plans',
        error: error.message
      });
    }
  }

  // Get plan details
  async getPlanDetails(req, res) {
    try {
      const { id } = req.params;
      
      const plan = await InsurancePlan.findOne({
        $or: [
          { _id: id },
          { code: id.toUpperCase() }
        ],
        isActive: true
      });

      if (!plan) {
        return res.status(404).json({
          success: false,
          message: 'Insurance plan not found'
        });
      }

      res.json({
        success: true,
        data: plan
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching plan details',
        error: error.message
      });
    }
  }

  // Get user's subscription
  async getUserSubscription(req, res) {
    try {
      const userId = req.user._id;
      
      const subscription = await InsuranceSubscription.findOne({
        user: userId,
        status: 'active'
      }).populate('plan');

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: 'No active insurance subscription found'
        });
      }

      res.json({
        success: true,
        data: subscription
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching subscription',
        error: error.message
      });
    }
  }

  // Subscribe to insurance plan
  async subscribe(req, res) {
    try {
      const userId = req.user._id;
      const { planId, paymentMethod } = req.body;

      // Check if user already has active subscription
      const existingSubscription = await InsuranceSubscription.findOne({
        user: userId,
        status: 'active'
      });

      if (existingSubscription) {
        return res.status(400).json({
          success: false,
          message: 'You already have an active insurance subscription'
        });
      }

      // Get plan details
      const plan = await InsurancePlan.findById(planId);
      if (!plan || !plan.isActive) {
        return res.status(404).json({
          success: false,
          message: 'Insurance plan not found or inactive'
        });
      }

      // Check wallet balance
      const wallet = await Wallet.findOne({ user: userId });
      if (!wallet || wallet.balance < plan.monthlyPremium) {
        return res.status(400).json({
          success: false,
          message: `Insufficient balance. Required: $${plan.monthlyPremium}`
        });
      }

      const session = await InsuranceSubscription.startSession();
      session.startTransaction();

      try {
        // Deduct premium from wallet
        const previousBalance = wallet.balance;
        const newBalance = previousBalance - plan.monthlyPremium;

        wallet.balance = newBalance;
        wallet.lastTransaction = new Date();
        await wallet.save({ session });

        // Create subscription
        const subscription = new InsuranceSubscription({
          user: userId,
          plan: plan._id,
          startDate: new Date(),
          status: 'active',
          paymentMethod: paymentMethod || 'wallet',
          totalPaid: plan.monthlyPremium,
          coverageUsed: new Map()
        });
        await subscription.save({ session });

        // Initialize coverage used for each service type
        plan.coverageDetails.forEach(coverage => {
          subscription.coverageUsed.set(coverage.serviceType, {
            used: 0,
            limit: coverage.limit
          });
        });
        await subscription.save({ session });

        // Create transaction record
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
          metadata: {
            planId: plan._id,
            planName: plan.name,
            subscriptionId: subscription._id
          },
          completedAt: new Date()
        });
        await transaction.save({ session });

        // Create notification
        const notification = new Notification({
          user: userId,
          type: 'insurance',
          title: 'Insurance Activated',
          message: `Your ${plan.name} insurance has been activated successfully.`,
          data: {
            subscriptionId: subscription._id,
            planName: plan.name,
            amount: plan.monthlyPremium
          }
        });
        await notification.save({ session });

        await session.commitTransaction();

        const populatedSubscription = await InsuranceSubscription
          .findById(subscription._id)
          .populate('plan');

        res.json({
          success: true,
          message: 'Insurance subscription activated successfully',
          data: populatedSubscription
        });
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error subscribing to insurance',
        error: error.message
      });
    }
  }

  // Submit insurance claim
  async submitClaim(req, res) {
    try {
      const userId = req.user._id;
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
        user: userId,
        status: 'active'
      }).populate('plan');

      if (!subscription) {
        return res.status(400).json({
          success: false,
          message: 'No active insurance subscription found'
        });
      }

      // Check if service type is covered
      const coverage = subscription.plan.coverageDetails.find(
        c => c.serviceType === type
      );

      if (!coverage) {
        return res.status(400).json({
          success: false,
          message: `Service type "${type}" is not covered by your plan`
        });
      }

      // Check coverage limits
      const coverageUsed = subscription.coverageUsed.get(type) || { used: 0, limit: 0 };
      const remainingCoverage = coverageUsed.limit - coverageUsed.used;

      if (remainingCoverage <= 0) {
        return res.status(400).json({
          success: false,
          message: `You have exhausted your coverage limit for ${type}`
        });
      }

      const claimableAmount = Math.min(amount, remainingCoverage);
      const coveredAmount = claimableAmount * (coverage.coveragePercentage / 100);

      const session = await InsuranceClaim.startSession();
      session.startTransaction();

      try {
        // Create claim
        const claim = new InsuranceClaim({
          user: userId,
          subscription: subscription._id,
          provider: providerId,
          type,
          amount: parseFloat(amount),
          approvedAmount: coveredAmount,
          description,
          serviceDate: new Date(serviceDate),
          supportingDocuments: supportingDocuments || [],
          status: 'pending'
        });
        await claim.save({ session });

        // Update coverage used
        coverageUsed.used += claimableAmount;
        subscription.coverageUsed.set(type, coverageUsed);
        await subscription.save({ session });

        // Create notification
        const notification = new Notification({
          user: userId,
          type: 'insurance',
          title: 'Claim Submitted',
          message: `Your ${type} claim for $${amount} has been submitted for review.`,
          data: {
            claimId: claim._id,
            claimType: type,
            amount,
            estimatedCoverage: coveredAmount
          }
        });
        await notification.save({ session });

        await session.commitTransaction();

        res.json({
          success: true,
          message: 'Insurance claim submitted successfully',
          data: {
            claimId: claim._id,
            amount,
            coveredAmount,
            status: 'pending',
            estimatedProcessingTime: '3-5 business days'
          }
        });
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error submitting insurance claim',
        error: error.message
      });
    }
  }

  // Get user's claims
  async getUserClaims(req, res) {
    try {
      const userId = req.user._id;
      const { status, page = 1, limit = 10 } = req.query;

      const query = { user: userId };
      if (status) query.status = status;

      const claims = await InsuranceClaim.paginate(query, {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { createdAt: -1 },
        populate: [
          { path: 'provider', select: 'name type' },
          { path: 'subscription', populate: { path: 'plan', select: 'name' } }
        ]
      });

      res.json({
        success: true,
        data: claims.docs,
        pagination: {
          total: claims.totalDocs,
          page: claims.page,
          pages: claims.totalPages,
          limit: claims.limit
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching claims',
        error: error.message
      });
    }
  }

  // Get coverage details
  async getCoverageDetails(req, res) {
    try {
      const userId = req.user._id;

      const subscription = await InsuranceSubscription.findOne({
        user: userId,
        status: 'active'
      }).populate('plan');

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: 'No active insurance subscription found'
        });
      }

      // Get recent claims
      const recentClaims = await InsuranceClaim.find({
        user: userId,
        subscription: subscription._id
      })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('type amount status createdAt');

      // Calculate coverage usage
      const coverageDetails = subscription.plan.coverageDetails.map(coverage => {
        const used = subscription.coverageUsed.get(coverage.serviceType) || { used: 0 };
        return {
          serviceType: coverage.serviceType,
          limit: coverage.limit,
          used: used.used,
          remaining: coverage.limit - used.used,
          coveragePercentage: coverage.coveragePercentage,
          period: coverage.period
        };
      });

      res.json({
        success: true,
        data: {
          subscription: {
            id: subscription._id,
            plan: subscription.plan.name,
            startDate: subscription.startDate,
            endDate: subscription.endDate,
            status: subscription.status,
            autoRenew: subscription.autoRenew
          },
          coverageDetails,
          recentClaims,
          totalCoverageUsed: Array.from(subscription.coverageUsed.values())
            .reduce((sum, item) => sum + item.used, 0)
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching coverage details',
        error: error.message
      });
    }
  }
}

module.exports = new InsuranceController();