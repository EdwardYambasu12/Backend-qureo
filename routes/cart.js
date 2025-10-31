// routes/cart.js
const express = require('express');
const router = express.Router();
const Cart = require('../models/Cart');
const Medicine = require('../models/Medicine');
const auth = require('../middleware/auth');

// ✅ Get user's cart
router.get('/', auth, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.userId }).populate('items.medicine');
    res.json(cart || { items: [], totalPrice: 0 });
  } catch (err) {
    res.status(500).json({ message: 'Failed to get cart', error: err.message });
  }
});

// ✅ Add item to cart
router.post('/add', auth, async (req, res) => {
  try {
    const { medicineId, quantity } = req.body;
    const medicine = await Medicine.findById(medicineId);
    if (!medicine) return res.status(404).json({ message: 'Medicine not found' });

    let cart = await Cart.findOne({ user: req.userId });

    if (!cart) {
      cart = new Cart({
        user: req.userId,
        items: [],
        totalPrice: 0
      });
    }

    const existingItem = cart.items.find(i => i.medicine.toString() === medicineId);

    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      cart.items.push({
        medicine: medicineId,
        quantity,
        price: medicine.price
      });
    }

    cart.totalPrice = cart.items.reduce((sum, i) => sum + i.quantity * i.price, 0);

    await cart.save();
    res.json(cart);
  } catch (err) {
    res.status(500).json({ message: 'Failed to add item', error: err.message });
  }
});

// ✅ Update item quantity
router.patch('/update/:itemId', auth, async (req, res) => {
  try {
    const { quantity } = req.body;
    const cart = await Cart.findOne({ user: req.userId });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    const item = cart.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ message: 'Item not found' });

    item.quantity = quantity;
    cart.totalPrice = cart.items.reduce((sum, i) => sum + i.quantity * i.price, 0);

    await cart.save();
    res.json(cart);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update item', error: err.message });
  }
});

// ✅ Remove item from cart
router.delete('/remove/:itemId', auth, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.userId });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    cart.items = cart.items.filter(i => i._id.toString() !== req.params.itemId);
    cart.totalPrice = cart.items.reduce((sum, i) => sum + i.quantity * i.price, 0);

    await cart.save();
    res.json(cart);
  } catch (err) {
    res.status(500).json({ message: 'Failed to remove item', error: err.message });
  }
});

// ✅ Clear entire cart
router.delete('/clear', auth, async (req, res) => {
  try {
    await Cart.findOneAndDelete({ user: req.userId });
    res.json({ message: 'Cart cleared successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to clear cart', error: err.message });
  }
});

// PATCH /api/cart/update
// body: { itemId, quantity }


module.exports = router;
