const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const HealthcareProvider = require('../models/HealthcareProvider');

// Get wallet balance (POST with userId in body)
router.get("/list-of-wallets", async (req, res) => {
  try {
    const wallets = await Wallet.find({});  
    res.json({ success: true, wallets });
    } catch (error) {
    res.status(500).json({ error: error.message });
    }   
});


router.post('/balance', async (req, res) => {
  try {
    const  userId  = req.query.user;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    let wallet = await Wallet.findOne({ user: userId });

    if (!wallet) {
      wallet = new Wallet({
        user: userId,
        balance: 12.50, // Starting balance
        currency: 'USD'
      });
      await wallet.save();
    }

    res.json({
      success: true,
      balance: wallet.balance,
      currency: wallet.currency,
      status: wallet.status,
      lastTransaction: wallet.lastTransaction
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/all-transactions", async (req, res) => {
  try {
    const transactions = await Transaction.find({});    
    res.json({ success: true, transactions });
    } catch (error) {
    res.status(500).json({ error: error.message });
    }
});

// Get transactions (POST with userId in body)
router.post('/transactions', async (req, res) => {
    console.log(req.body.userId, "transaction userId");
  try {
    const { userId, limit = 10, page = 1 } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const skip = (page - 1) * limit;

    const transactions = await Transaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('provider', 'name type icon');

      

    const total = await Transaction.countDocuments({ user: userId });

    console.log({
      success: true,
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    
})
    res.json({
      success: true,
      transactions,
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

// Add money to wallet
router.post('/deposit', async (req, res) => {
  try {
    const { userId, amount, paymentMethod } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      let wallet = await Wallet.findOne({ user: userId }).session(session);

      if (!wallet) {
        wallet = new Wallet({ user: userId, balance: 0, currency: 'USD' });
      }

      const previousBalance = wallet.balance;
      const newBalance = previousBalance + parseFloat(amount);

      wallet.balance = newBalance;
      wallet.totalDeposits += parseFloat(amount);
      wallet.lastTransaction = new Date();
      await wallet.save({ session });

      const transaction = new Transaction({
        wallet: wallet._id,
        user: userId,
        type: 'deposit',
        amount: parseFloat(amount),
        previousBalance,
        newBalance,
        status: 'completed',
        paymentMethod: paymentMethod || 'wallet',
        description: `Deposit of $${amount}`,
        reference: `DEP-${Date.now()}`,
        completedAt: new Date()
      });
      await transaction.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.json({
        success: true,
        message: 'Deposit successful',
        newBalance,
        transactionId: transaction._id
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

// Withdraw money
router.post('/withdraw', async (req, res) => {
  try {
    const { userId, amount, withdrawalMethod } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const wallet = await Wallet.findOne({ user: userId }).session(session);
      if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
      if (wallet.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });

      const previousBalance = wallet.balance;
      const newBalance = previousBalance - parseFloat(amount);

      wallet.balance = newBalance;
      wallet.totalWithdrawals += parseFloat(amount);
      wallet.lastTransaction = new Date();
      await wallet.save({ session });

      const transaction = new Transaction({
        wallet: wallet._id,
        user: userId,
        type: 'withdrawal',
        amount: parseFloat(amount),
        previousBalance,
        newBalance,
        status: 'pending',
        paymentMethod: withdrawalMethod || 'bank_transfer',
        description: `Withdrawal of $${amount}`,
        reference: `WITH-${Date.now()}`
      });
      await transaction.save({ session });

      await session.commitTransaction();
      session.endSession();

      setTimeout(async () => {
        transaction.status = 'completed';
        transaction.completedAt = new Date();
        await transaction.save();
      }, 2000);

      res.json({
        success: true,
        message: 'Withdrawal initiated',
        newBalance,
        transactionId: transaction._id,
        estimatedCompletion: '24 hours'
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

// Pay provider
router.post('/pay-provider', async (req, res) => {
  try {
    const { userId, providerId, amount, serviceDetails } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    if (!providerId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Provider ID and valid amount required' });
    }

    const provider = await HealthcareProvider.findById(providerId);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const wallet = await Wallet.findOne({ user: userId }).session(session);
      if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
      if (wallet.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });

      const previousBalance = wallet.balance;
      const newBalance = previousBalance - parseFloat(amount);

      wallet.balance = newBalance;
      wallet.lastTransaction = new Date();
      await wallet.save({ session });

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
        description: `Payment to ${provider.name} for ${serviceDetails || 'healthcare service'}`,
        reference: `PAY-${Date.now()}`,
        metadata: { serviceDetails },
        completedAt: new Date()
      });
      await transaction.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.json({
        success: true,
        message: `Payment to ${provider.name} successful`,
        newBalance,
        transactionId: transaction._id,
        provider: {
          id: provider._id,
          name: provider.name,
          type: provider.type
        }
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

// Get transaction details (POST with userId in body)
router.post('/transactions/:id', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const transaction = await Transaction.findOne({
      _id: req.params.id,
      user: userId
    }).populate('provider', 'name type address contactPhone');

    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

    res.json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;