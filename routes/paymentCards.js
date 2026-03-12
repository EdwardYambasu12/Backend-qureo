const express = require('express');
const Stripe = require('stripe');
const auth = require('../middleware/auth');
const PaymentCard = require('../models/PaymentCard');

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const detectBrand = (cardNumberDigits) => {
  if (/^4\d{12}(\d{3})?$/.test(cardNumberDigits)) return 'visa';
  if (/^(5[1-5]\d{14}|2(2[2-9]|[3-6]\d|7[01])\d{12})$/.test(cardNumberDigits)) return 'mastercard';
  if (/^3[47]\d{13}$/.test(cardNumberDigits)) return 'amex';
  if (/^(6011\d{12}|65\d{14}|64[4-9]\d{13})$/.test(cardNumberDigits)) return 'discover';
  return 'unknown';
};

router.get('/', auth, async (req, res) => {
  try {
    const cards = await PaymentCard.find({ user: req.userId }).sort({ isDefault: -1, createdAt: -1 });
    res.json({ cards });
  } catch (err) {
    console.error('paymentCards/get error:', err);
    res.status(500).json({ message: 'Failed to fetch payment cards' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { cardholderName, cardNumber, expMonth, expYear, isDefault, paymentMethodId } = req.body || {};

    if (!cardholderName || !String(cardholderName).trim()) {
      return res.status(400).json({ message: 'cardholderName is required' });
    }

    let brand = 'unknown';
    let last4 = '';
    let month = Number(expMonth);
    let year = Number(expYear);
    let stripePaymentMethodId = '';

    if (paymentMethodId) {
      try {
        const pm = await stripe.paymentMethods.retrieve(String(paymentMethodId));
        if (!pm || pm.type !== 'card' || !pm.card) {
          return res.status(400).json({ message: 'Invalid Stripe payment method' });
        }

        brand = String(pm.card.brand || 'unknown').toLowerCase();
        last4 = String(pm.card.last4 || '');
        month = Number(pm.card.exp_month);
        year = Number(pm.card.exp_year);
        stripePaymentMethodId = pm.id;
      } catch (stripeErr) {
        return res.status(400).json({ message: 'Unable to validate Stripe payment method' });
      }
    } else {
      const digits = String(cardNumber || '').replace(/\D/g, '');
      if (digits.length < 12 || digits.length > 19) {
        return res.status(400).json({ message: 'Invalid card number' });
      }

      if (!Number.isInteger(month) || month < 1 || month > 12) {
        return res.status(400).json({ message: 'Invalid expiry month' });
      }

      if (!Number.isInteger(year) || year < new Date().getFullYear()) {
        return res.status(400).json({ message: 'Invalid expiry year' });
      }

      brand = detectBrand(digits);
      last4 = digits.slice(-4);
    }

    if (!last4 || last4.length !== 4) {
      return res.status(400).json({ message: 'Invalid last4 value for card' });
    }

    if (Boolean(isDefault)) {
      await PaymentCard.updateMany({ user: req.userId, isDefault: true }, { isDefault: false });
    }

    const card = await PaymentCard.create({
      user: req.userId,
      cardholderName: String(cardholderName).trim(),
      brand,
      last4,
      expMonth: month,
      expYear: year,
      isDefault: Boolean(isDefault),
      stripePaymentMethodId,
    });

    res.status(201).json({ card });
  } catch (err) {
    console.error('paymentCards/post error:', err);
    res.status(500).json({ message: 'Failed to save payment card' });
  }
});

router.patch('/:id/default', auth, async (req, res) => {
  try {
    const card = await PaymentCard.findOne({ _id: req.params.id, user: req.userId });
    if (!card) return res.status(404).json({ message: 'Card not found' });

    await PaymentCard.updateMany({ user: req.userId, isDefault: true }, { isDefault: false });
    card.isDefault = true;
    await card.save();

    res.json({ card });
  } catch (err) {
    console.error('paymentCards/default error:', err);
    res.status(500).json({ message: 'Failed to set default card' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const deleted = await PaymentCard.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!deleted) return res.status(404).json({ message: 'Card not found' });

    if (deleted.isDefault) {
      const next = await PaymentCard.findOne({ user: req.userId }).sort({ createdAt: -1 });
      if (next) {
        next.isDefault = true;
        await next.save();
      }
    }

    res.json({ message: 'Card removed' });
  } catch (err) {
    console.error('paymentCards/delete error:', err);
    res.status(500).json({ message: 'Failed to remove card' });
  }
});

module.exports = router;
