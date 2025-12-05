// controllers/wallet.controller.js
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const HealthcareProvider = require('../models/HealthcareProvider');
//const Notification = require('../models/Notification');

class WalletController {
  // Get wallet balance
  async getWalletBalance(req, res) {
    try {
      const userId = req.user._id;
      
      let wallet = await Wallet.findOne({ user: userId });
      
      if (!wallet) {
        // Create wallet if it doesn't exist
        wallet = new Wallet({
          user: userId,
          balance: 0,
          currency: 'USD'
        });
        await wallet.save();
      }

      res.json({
        success: true,
        data: {
          balance: wallet.balance,
          currency: wallet.currency,
          status: wallet.status,
          totalDeposits: wallet.totalDeposits,
          totalWithdrawals: wallet.totalWithdrawals,
          lastTransaction: wallet.lastTransaction
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching wallet balance',
        error: error.message
      });
    }
  }

  // Get transactions
  async getTransactions(req, res) {
    try {
      const userId = req.user._id;
      const { 
        page = 1, 
        limit = 10, 
        type, 
        startDate, 
        endDate 
      } = req.query;

      const query = { user: userId };
      
      // Apply filters
      if (type) query.type = type;
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { createdAt: -1 },
        populate: [
          { path: 'provider', select: 'name type icon' },
          { path: 'insuranceClaim', select: 'type status' }
        ]
      };

      const transactions = await Transaction.paginate(query, options);

      res.json({
        success: true,
        data: transactions.docs,
        pagination: {
          total: transactions.totalDocs,
          page: transactions.page,
          pages: transactions.totalPages,
          limit: transactions.limit
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching transactions',
        error: error.message
      });
    }
  }

  // Deposit money
  async deposit(req, res) {
    try {
      const userId = req.user._id;
      const { amount, paymentMethod, reference } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid amount is required'
        });
      }

      const session = await Wallet.startSession();
      session.startTransaction();

      try {
        // Find or create wallet
        let wallet = await Wallet.findOne({ user: userId }).session(session);
        
        if (!wallet) {
          wallet = new Wallet({
            user: userId,
            balance: 0,
            currency: 'USD'
          });
        }

        const previousBalance = wallet.balance;
        const newBalance = previousBalance + parseFloat(amount);

        // Update wallet
        wallet.balance = newBalance;
        wallet.totalDeposits += parseFloat(amount);
        wallet.lastTransaction = new Date();
        await wallet.save({ session });

        // Create transaction record
        const transaction = new Transaction({
          wallet: wallet._id,
          user: userId,
          type: 'deposit',
          amount: parseFloat(amount),
          previousBalance,
          newBalance,
          status: 'completed',
          paymentMethod: paymentMethod || 'wallet',
          description: `Wallet deposit of $${amount}`,
          reference,
          metadata: req.body.metadata || {},
          completedAt: new Date()
        });
        await transaction.save({ session });

        // Create notification
        const notification = new Notification({
          user: userId,
          type: 'transaction',
          title: 'Deposit Successful',
          message: `Your deposit of $${amount} has been completed successfully.`,
          data: {
            transactionId: transaction._id,
            amount,
            newBalance
          }
        });
        await notification.save({ session });

        await session.commitTransaction();

        res.json({
          success: true,
          message: 'Deposit successful',
          data: {
            transactionId: transaction._id,
            amount: parseFloat(amount),
            previousBalance,
            newBalance,
            reference
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
        message: 'Deposit failed',
        error: error.message
      });
    }
  }

  // Withdraw money
  async withdraw(req, res) {
    try {
      const userId = req.user._id;
      const { amount, withdrawalMethod, accountDetails } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid amount is required'
        });
      }

      const session = await Wallet.startSession();
      session.startTransaction();

      try {
        const wallet = await Wallet.findOne({ user: userId }).session(session);
        
        if (!wallet) {
          return res.status(404).json({
            success: false,
            message: 'Wallet not found'
          });
        }

        if (wallet.balance < amount) {
          return res.status(400).json({
            success: false,
            message: 'Insufficient balance'
          });
        }

        const previousBalance = wallet.balance;
        const newBalance = previousBalance - parseFloat(amount);

        // Update wallet
        wallet.balance = newBalance;
        wallet.totalWithdrawals += parseFloat(amount);
        wallet.lastTransaction = new Date();
        await wallet.save({ session });

        // Create transaction
        const transaction = new Transaction({
          wallet: wallet._id,
          user: userId,
          type: 'withdrawal',
          amount: parseFloat(amount),
          previousBalance,
          newBalance,
          status: 'pending', // Will be completed after bank processing
          paymentMethod: withdrawalMethod || 'bank_transfer',
          description: `Withdrawal of $${amount}`,
          metadata: {
            accountDetails,
            ...(req.body.metadata || {})
          }
        });
        await transaction.save({ session });

        // Simulate bank processing (in real app, integrate with payment gateway)
        setTimeout(async () => {
          transaction.status = 'completed';
          transaction.completedAt = new Date();
          await transaction.save();
        }, 5000);

        // Create notification
        const notification = new Notification({
          user: userId,
          type: 'transaction',
          title: 'Withdrawal Requested',
          message: `Your withdrawal of $${amount} has been initiated. It will be processed within 24 hours.`,
          data: {
            transactionId: transaction._id,
            amount,
            newBalance
          }
        });
        await notification.save({ session });

        await session.commitTransaction();

        res.json({
          success: true,
          message: 'Withdrawal initiated',
          data: {
            transactionId: transaction._id,
            amount: parseFloat(amount),
            previousBalance,
            newBalance,
            estimatedCompletion: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
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
        message: 'Withdrawal failed',
        error: error.message
      });
    }
  }

  // Pay healthcare provider
  async payProvider(req, res) {
    try {
      const userId = req.user._id;
      const { providerId, amount, serviceDetails, useInsurance } = req.body;

      if (!providerId || !amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Provider ID and valid amount are required'
        });
      }

      const session = await Wallet.startSession();
      session.startTransaction();

      try {
        const wallet = await Wallet.findOne({ user: userId }).session(session);
        const provider = await HealthcareProvider.findById(providerId).session(session);

        if (!wallet) {
          return res.status(404).json({
            success: false,
            message: 'Wallet not found'
          });
        }

        if (!provider) {
          return res.status(404).json({
            success: false,
            message: 'Healthcare provider not found'
          });
        }

        if (wallet.balance < amount) {
          return res.status(400).json({
            success: false,
            message: 'Insufficient balance'
          });
        }

        const previousBalance = wallet.balance;
        const newBalance = previousBalance - parseFloat(amount);

        // Update wallet
        wallet.balance = newBalance;
        wallet.lastTransaction = new Date();
        await wallet.save({ session });

        // Check insurance coverage
        let insuranceCoverage = null;
        let insuranceClaimId = null;
        
        if (useInsurance) {
          // This would integrate with insurance service
          insuranceCoverage = await this.checkInsuranceCoverage(userId, amount, serviceDetails);
          
          if (insuranceCoverage && insuranceCoverage.coveredAmount > 0) {
            // Create insurance claim record
            // Implementation would go here
          }
        }

        // Create transaction
        const transaction = new Transaction({
          wallet: wallet._id,
          user: userId,
          provider: providerId,
          type: 'payment',
          amount: parseFloat(amount),
          previousBalance,
          newBalance,
          status: 'completed',
          paymentMethod: 'wallet',
          description: `Payment to ${provider.name} for ${serviceDetails?.service || 'healthcare service'}`,
          metadata: {
            serviceDetails,
            insuranceCoverage,
            providerName: provider.name,
            providerType: provider.type,
            ...(req.body.metadata || {})
          },
          completedAt: new Date()
        });
        await transaction.save({ session });

        // Create notification
        const notification = new Notification({
          user: userId,
          type: 'payment',
          title: 'Payment Successful',
          message: `Payment of $${amount} to ${provider.name} has been completed.`,
          data: {
            transactionId: transaction._id,
            providerId: provider._id,
            providerName: provider.name,
            amount,
            newBalance
          }
        });
        await notification.save({ session });

        await session.commitTransaction();

        res.json({
          success: true,
          message: 'Payment successful',
          data: {
            transactionId: transaction._id,
            amount: parseFloat(amount),
            previousBalance,
            newBalance,
            provider: {
              id: provider._id,
              name: provider.name,
              type: provider.type
            },
            insuranceCoverage
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
        message: 'Payment failed',
        error: error.message
      });
    }
  }

  // Get transaction details
  async getTransactionDetails(req, res) {
    try {
      const userId = req.user._id;
      const { id } = req.params;

      const transaction = await Transaction.findOne({
        _id: id,
        user: userId
      }).populate([
        { path: 'provider', select: 'name type icon address contact' },
        { path: 'insuranceClaim', select: 'type status approvedAmount' }
      ]);

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      res.json({
        success: true,
        data: transaction
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching transaction details',
        error: error.message
      });
    }
  }

  // Get transaction summary
  async getTransactionSummary(req, res) {
    try {
      const userId = req.user._id;
      const { startDate, endDate } = req.query;

      const matchStage = { user: userId };
      
      if (startDate || endDate) {
        matchStage.createdAt = {};
        if (startDate) matchStage.createdAt.$gte = new Date(startDate);
        if (endDate) matchStage.createdAt.$lte = new Date(endDate);
      }

      const summary = await Transaction.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            avgAmount: { $avg: '$amount' }
          }
        },
        { $sort: { totalAmount: -1 } }
      ]);

      const totalStats = await Transaction.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalTransactions: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            deposits: { 
              $sum: { $cond: [{ $eq: ['$type', 'deposit'] }, '$amount', 0] } 
            },
            withdrawals: { 
              $sum: { $cond: [{ $eq: ['$type', 'withdrawal'] }, '$amount', 0] } 
            },
            payments: { 
              $sum: { $cond: [{ $eq: ['$type', 'payment'] }, '$amount', 0] } 
            }
          }
        }
      ]);

      res.json({
        success: true,
        data: {
          summary,
          totals: totalStats[0] || {},
          period: { startDate, endDate }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching transaction summary',
        error: error.message
      });
    }
  }

  // Helper method to check insurance coverage
  async checkInsuranceCoverage(userId, amount, serviceDetails) {
    // Implementation would check insurance subscription and coverage
    // This is a simplified version
    return {
      coveredAmount: 0,
      coveragePercentage: 0,
      isCovered: false,
      notes: 'Insurance check not implemented'
    };
  }
}

module.exports = new WalletController();