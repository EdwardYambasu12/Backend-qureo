const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const HealthcareProvider = require('../models/HealthcareProvider');
const User = require('../models/User');
const Profile = require('../models/Profile');
const Stripe = require("stripe")
const Provider = require("../models/Provider")
const Dependent = require('../models/Dependent');


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const APPROVED_SERVICE_CATEGORIES = new Set([
  'consultation',
  'medicine',
  'lab_test',
  'emergency_transport',
  'follow_up',
  'insurance_premium',
]);

const COVERAGE_PRICE_BOOK = {
  consultation: 35,
  medicine_refill: 18,
  lab_test: 60,
  emergency_transport: 120,
};

const SOURCE_TO_BUCKET = {
  wallet_balance: 'walletBalance',
  mobile_money: 'mobileMoney',
  card: 'card',
  bank_transfer: 'bankTransfer',
  employer_contribution: 'employerSupport',
  donor_voucher: 'donorVoucher',
  family_support: 'familySupport',
};

const ensureWallet = async (userId, session = null) => {
  const query = Wallet.findOne({ user: userId });
  if (session) query.session(session);

  let wallet = await query;
  if (!wallet) {
    wallet = new Wallet({
      user: userId,
      balance: 0,
      currency: 'USD',
      reservedFunds: {
        walletBalance: 0,
        familySupport: 0,
        employerSupport: 0,
        donorVoucher: 0,
        mobileMoney: 0,
        card: 0,
        bankTransfer: 0,
      },
    });
    await wallet.save(session ? { session } : undefined);
  }

  return wallet;
};
// Get wallet balance (POST with userId in body)
router.get("/list-of-wallets", async (req, res) => {
  try {
    const wallets = await Wallet.find({});  
    res.json({ success: true, wallets });
    } catch (error) {
    res.status(500).json({ error: error.message });
    }   
});

/*


router.post('/webhook',
  express.raw({ type: 'application/json' }),
 
  async (req, res) => {
 console.log("being called")
    const sig = req.headers['stripe-signature'];
    let event;

    console.log(sig, "sig")
  
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET

      );

      
    } catch (err) {
      console.log(err.message)
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

      console.log(event, "event")
    if (event.type === 'payment_intent.succeeded') {

      const paymentIntent = event.data.object;
      const userId = paymentIntent.metadata.userId;
      const amount = paymentIntent.amount / 100;
      console.log("payment succeed")
      // 🔥 Prevent duplicate credits
      const existingTransaction = await Transaction.findOne({
        stripePaymentIntentId: paymentIntent.id
      });

      if (existingTransaction) {
        return res.json({ received: true });
      }

      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        let wallet = await Wallet.findOne({ user: userId }).session(session);

        if (!wallet) {
          wallet = new Wallet({
            user: userId,
            balance: 0,
            currency: 'USD',
            totalDeposits: 0
          });
        }

        const previousBalance = wallet.balance;
        const newBalance = previousBalance + amount;

        wallet.balance = newBalance;
        wallet.totalDeposits += amount;
        wallet.lastTransaction = new Date();
        await wallet.save({ session });

        const transaction = new Transaction({
          wallet: wallet._id,
          user: userId,
          type: 'deposit',
          amount,
          previousBalance,
          newBalance,
          status: 'completed',
          paymentMethod: 'stripe',
          stripePaymentIntentId: paymentIntent.id, // 🔐 critical
          description: `Stripe deposit of $${amount}`,
          reference: `STRIPE-${paymentIntent.id}`,
          completedAt: new Date()
        });

        await transaction.save({ session });

        await session.commitTransaction();
        session.endSession();

      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error(error);
      }
    }

    res.json({ received: true });
});

*/

// JSON AFTER webhook
router.use(express.json());

/**
 * Create PaymentIntent
 */


router.post("/api/create-payment-intent", async (req, res) => {
  try {
    const { amount, userId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        userId,
      },
    });

    res.json({ clientSecret: paymentIntent.client_secret });

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
        balance: 0, // Starting balance
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

router.get("/transaction-wallet/:providerId", async (req, res) => {
  try {
    const { providerId } = req.params;

    if (!providerId) {
      return res.status(400).json({ error: "Provider ID is required" });
    }

    const transactions = await Transaction.find({ provider: providerId })
      .sort({ createdAt: -1 }) // newest first
      .populate("user", "name email") // optional
      .populate("provider", "email type"); // optional

    res.json({
      success: true,
      count: transactions.length,
      transactions
    });

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



//External Transfer
router.post("/top-up", async (req, res) => {
  console.log("being called");

  const session = await Wallet.startSession();
  session.startTransaction();
  console.log(req.body.data, "data")

  const body = req.body.data
  try {
    const { reciverId, amount, senderName, senderContact } = body;
    console.log(reciverId)
    if (!reciverId || !amount) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    let wallet = await Wallet.findOne({ user: reciverId }).session(session);
    if (!wallet) {
      console.log(
      "wallet not found"
      )
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Wallet not found" });
    }

    const previousBalance = wallet.balance;
    const newBalance = previousBalance + parseFloat(amount);

    wallet.balance = newBalance;
    wallet.totalDeposits += parseFloat(amount);
    wallet.lastTransaction = new Date();
    await wallet.save({ session });

    const transaction = new Transaction({
      wallet: wallet._id,
      user: reciverId,
      type: "deposit",
      amount: parseFloat(amount),
      previousBalance,
      newBalance,
      status: "completed",
      paymentMethod: "-",
      description: `Deposit of ₦${amount} from ${senderName || "Unknown"}`,
      reference: `DEP-${Date.now()}`,
      completedAt: new Date(),
    });
    await transaction.save({ session });

    await session.commitTransaction();
    session.endSession();

    // ✅ Send a proper response back
    return res.status(200).json({
      success: true,
      message: "Wallet top-up successful",
      data: {
        walletBalance: wallet.balance,
        transactionId: transaction._id,
      },
    });
  } catch (error) {
    console.error("Top-up error:", error);
    await session.abortTransaction();
    session.endSession();

    // ❌ Always send an error response too
    return res.status(500).json({
      success: false,
      message: "An error occurred during wallet top-up",
      error: error.message,
    });
  }
});


// Add money to wallet
// This should ONLY create Stripe PaymentIntent
router.post('/deposit', async (req, res) => {
  try {
    const { userId, amount } = req.body;

    if (!userId) return res.status(400).json({ error: 'userId required' });
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      metadata: { userId },
      automatic_payment_methods: { enabled: true }
    });

    res.json({
      clientSecret: paymentIntent.client_secret
    });

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
    const { userId, providerId, amount, serviceDetails, type } = req.body;

    if (!userId) return res.status(400).json({ error: 'userId is required' });
    if (!providerId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Provider ID and valid amount required' });
    }

    const provider = await Provider.findById(providerId);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1️⃣ Get user wallet
      const wallet = await Wallet.findOne({ user: userId }).session(session);
      if (!wallet) throw new Error('User wallet not found');

      if (wallet.balance < amount) {
        throw new Error('Insufficient balance');
      }

      const previousBalance = wallet.balance;
      const newBalance = previousBalance - parseFloat(amount);

      wallet.balance = newBalance;
      wallet.lastTransaction = new Date();
      await wallet.save({ session });

      // 2️⃣ Get provider wallet
      const wallet2 = await Wallet.findOne({ user: providerId }).session(session);

      if (!wallet2) throw new Error('Provider wallet not found');

      const providerPreviousBalance = wallet2.balance;
      const providerNewBalance = providerPreviousBalance + parseFloat(amount);

      wallet2.balance = providerNewBalance;
      wallet2.lastTransaction = new Date();
      await wallet2.save({ session });

      // 3️⃣ Save transaction
      const transaction = new Transaction({
        wallet: wallet._id,
        user: userId,
        provider: providerId,
        type,
        amount: parseFloat(amount),
        previousBalance,
        newBalance,
        status: 'completed',
        paymentMethod: 'wallet',
        description: serviceDetails || 'healthcare service',
        reference: `PAY-${Date.now()}`,
        metadata: { serviceDetails },
        completedAt: new Date()
      });

      await transaction.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.json({
        success: true,
        message: `Payment to ${provider.email} successful`,
        newBalance,
        transactionId: transaction._id
      });

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      res.status(400).json({ error: error.message });
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

// Add funds from explicit healthcare funding sources
router.post('/funding-source/add', async (req, res) => {
  try {
    const { userId, amount, sourceType = 'wallet_balance', sourceLabel = '' } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const normalizedSource = String(sourceType).toLowerCase();
    const bucketKey = SOURCE_TO_BUCKET[normalizedSource];
    if (!bucketKey) {
      return res.status(400).json({ error: 'Unsupported sourceType' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const wallet = await ensureWallet(userId, session);
      const fundingAmount = Number(amount);
      const previousBalance = wallet.balance;
      const newBalance = previousBalance + fundingAmount;

      wallet.balance = newBalance;
      wallet.totalDeposits += fundingAmount;
      wallet.lastTransaction = new Date();
      wallet.reservedFunds[bucketKey] = Number(wallet.reservedFunds[bucketKey] || 0) + fundingAmount;

      await wallet.save({ session });

      const transaction = new Transaction({
        wallet: wallet._id,
        user: userId,
        type: 'care_fund_addition',
        amount: fundingAmount,
        previousBalance,
        newBalance,
        status: 'completed',
        paymentMethod: normalizedSource,
        fundingSource: bucketKey,
        description: `Added care funds via ${sourceLabel || normalizedSource}`,
        reference: `FUND-${Date.now()}`,
        metadata: { sourceType: normalizedSource, sourceLabel },
        completedAt: new Date(),
      });

      await transaction.save({ session });
      await session.commitTransaction();
      session.endSession();

      return res.json({
        success: true,
        message: 'Care funds added successfully',
        wallet: {
          balance: wallet.balance,
          reservedFunds: wallet.reservedFunds,
        },
        transactionId: transaction._id,
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Add a dependent under wallet owner
router.post('/dependents/add', async (req, res) => {
  try {
    const { userId, fullName, relationship = 'other', dateOfBirth = null } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    if (!fullName || !String(fullName).trim()) return res.status(400).json({ error: 'fullName is required' });

    const dependent = await Dependent.create({
      owner: userId,
      fullName: String(fullName).trim(),
      relationship,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
    });

    return res.status(201).json({
      success: true,
      message: 'Dependent added successfully',
      dependent,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/dependents', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const dependents = await Dependent.find({ owner: userId, active: true }).sort({ createdAt: -1 });
    return res.json({ success: true, dependents });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.delete('/dependents/:id', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const dependent = await Dependent.findOneAndUpdate(
      { _id: req.params.id, owner: userId },
      { active: false },
      { new: true }
    );

    if (!dependent) return res.status(404).json({ error: 'Dependent not found' });
    return res.json({ success: true, message: 'Dependent removed', dependentId: dependent._id });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Restricted payment endpoint for approved healthcare services only with split funding support
router.post('/pay-approved-service', async (req, res) => {
  try {
    const {
      userId,
      providerId,
      amount,
      serviceCategory,
      serviceDetails,
      dependentId = null,
      split = {},
    } = req.body;

    if (!userId) return res.status(400).json({ error: 'userId is required' });
    if (!providerId) return res.status(400).json({ error: 'providerId is required' });
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const normalizedCategory = String(serviceCategory || '').toLowerCase();
    if (!APPROVED_SERVICE_CATEGORIES.has(normalizedCategory)) {
      return res.status(400).json({
        error: 'Funds are restricted to approved healthcare services only',
      });
    }

    if (dependentId) {
      const dependent = await Dependent.findOne({ _id: dependentId, owner: userId, active: true });
      if (!dependent) {
        return res.status(400).json({ error: 'Dependent is invalid for this wallet owner' });
      }
    }

    const provider = await Provider.findById(providerId);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const totalAmount = Number(amount);
    const defaultSplit = {
      walletBalance: totalAmount,
      familySupport: 0,
      employerSupport: 0,
      donorVoucher: 0,
      insuranceCoverage: 0,
    };

    const requestedSplit = {
      ...defaultSplit,
      ...split,
    };

    const normalizedSplit = Object.fromEntries(
      Object.entries(requestedSplit).map(([key, value]) => [key, Math.max(0, Number(value) || 0)])
    );

    const splitSum = Object.values(normalizedSplit).reduce((sum, value) => sum + value, 0);
    if (Math.round(splitSum * 100) !== Math.round(totalAmount * 100)) {
      return res.status(400).json({ error: 'Split allocation must equal total amount' });
    }

    const walletDebit = normalizedSplit.walletBalance + normalizedSplit.familySupport + normalizedSplit.employerSupport + normalizedSplit.donorVoucher;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const wallet = await ensureWallet(userId, session);
      if (wallet.balance < walletDebit) {
        throw new Error('Insufficient wallet balance for requested split');
      }

      if (Number(wallet.reservedFunds.familySupport || 0) < normalizedSplit.familySupport) {
        throw new Error('Insufficient family support funds');
      }
      if (Number(wallet.reservedFunds.employerSupport || 0) < normalizedSplit.employerSupport) {
        throw new Error('Insufficient employer support funds');
      }
      if (Number(wallet.reservedFunds.donorVoucher || 0) < normalizedSplit.donorVoucher) {
        throw new Error('Insufficient donor voucher funds');
      }

      const previousBalance = wallet.balance;
      const newBalance = previousBalance - walletDebit;

      wallet.balance = newBalance;
      wallet.lastTransaction = new Date();
      wallet.reservedFunds.familySupport = Number(wallet.reservedFunds.familySupport || 0) - normalizedSplit.familySupport;
      wallet.reservedFunds.employerSupport = Number(wallet.reservedFunds.employerSupport || 0) - normalizedSplit.employerSupport;
      wallet.reservedFunds.donorVoucher = Number(wallet.reservedFunds.donorVoucher || 0) - normalizedSplit.donorVoucher;
      wallet.reservedFunds.walletBalance = Math.max(0, Number(wallet.reservedFunds.walletBalance || 0) - normalizedSplit.walletBalance);
      await wallet.save({ session });

      const providerWallet = await ensureWallet(providerId, session);
      providerWallet.balance += totalAmount;
      providerWallet.lastTransaction = new Date();
      await providerWallet.save({ session });

      const transaction = new Transaction({
        wallet: wallet._id,
        user: userId,
        provider: providerId,
        dependentId,
        type: 'approved_healthcare_payment',
        serviceCategory: normalizedCategory,
        amount: totalAmount,
        previousBalance,
        newBalance,
        status: 'completed',
        paymentMethod: 'split',
        fundingSource: 'mixed',
        splitAllocation: normalizedSplit,
        description: serviceDetails || `Payment for ${normalizedCategory}`,
        reference: `HLPAY-${Date.now()}`,
        metadata: {
          serviceDetails,
          insuranceApplied: normalizedSplit.insuranceCoverage > 0,
        },
        completedAt: new Date(),
      });

      await transaction.save({ session });

      await session.commitTransaction();
      session.endSession();

      return res.json({
        success: true,
        message: `Payment to ${provider.email || 'provider'} successful`,
        newBalance,
        splitAllocation: normalizedSplit,
        transactionId: transaction._id,
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.get('/alerts', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const wallet = await ensureWallet(userId);
    const isLowBalance = wallet.balance <= Number(wallet.lowBalanceThreshold || 0);

    return res.json({
      success: true,
      alerts: {
        isLowBalance,
        balance: wallet.balance,
        threshold: wallet.lowBalanceThreshold,
        message: isLowBalance ? 'Care wallet balance is low. Add funds to avoid care disruption.' : '',
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/coverage-estimate', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const wallet = await ensureWallet(userId);
    const balance = Number(wallet.balance || 0);

    const estimate = {
      consultation: Math.floor(balance / COVERAGE_PRICE_BOOK.consultation),
      medicineRefills: Math.floor(balance / COVERAGE_PRICE_BOOK.medicine_refill),
      labTests: Math.floor(balance / COVERAGE_PRICE_BOOK.lab_test),
      emergencyTrips: Math.floor(balance / COVERAGE_PRICE_BOOK.emergency_transport),
    };

    return res.json({
      success: true,
      balance,
      estimate,
      referencePricing: COVERAGE_PRICE_BOOK,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const wallet = await ensureWallet(userId);
    const recentTransactions = await Transaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('type amount serviceCategory splitAllocation createdAt status description');

    const reserved = wallet.reservedFunds || {};
    const reservedForHealthcare = Object.values(reserved).reduce((sum, value) => sum + Number(value || 0), 0);

    return res.json({
      success: true,
      summary: {
        balance: wallet.balance,
        reservedForHealthcare,
        reservedFunds: reserved,
        recentTransactions,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});


module.exports = router;