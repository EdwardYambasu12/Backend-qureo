// models/Cart.js
const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [
    {
      medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
      quantity: { type: Number, required: true, min: 1 },
      price: { type: Number, required: true }
    }
  ],
  totalPrice: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Cart', cartSchema);
