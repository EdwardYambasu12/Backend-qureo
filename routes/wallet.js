const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const HealthcareProvider = require('../models/HealthcareProvider');
const User = require('../models/User');
const Profile = require('../models/Profile');
const Stripe = require("stripe")



const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
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


      
    console.log(req.body, "pay provider body");
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    if (!providerId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Provider ID and valid amount required' });
    }
    
    const provider = await User.findById(providerId);
    console.log(provider, "provider details");
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const wallet = await Wallet.findOne({ user: userId }).session(session);
      if (!wallet) return res.status(404).json({ message: 'Wallet not found' });
      if (wallet.balance < amount) return res.json({ message: 'Insufficient balance', success: false });
      if (wallet.balance < amount) return res.status(400).json({ message: 'Insufficient balance', success: false });
      const previousBalance = wallet.balance;
      const newBalance = previousBalance - parseFloat(amount);



      wallet.balance = newBalance;
      wallet.lastTransaction = new Date();
      await wallet.save({ session });

      const transaction = new Transaction({
        wallet: wallet._id,
        user: userId,
        provider: providerId,
        type: type,
        amount: parseFloat(amount),
        previousBalance,
        newBalance,
        status: 'completed',
        paymentMethod: 'wallet',
        description: `${serviceDetails || 'healthcare service'}`,
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
        transactionId: transaction._id,
        provider: {
          id: provider._id,
          name: provider.email,
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