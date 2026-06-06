// routes/order.js
const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const auth = require('../middleware/auth');

const getIO = () => {
  try {
    return require('../index').io;
  } catch {
    return null;
  }
};

// ✅ Create order from cart
router.post("/", auth, async (req, res) => {
  try {
    const { paymentMethod } = req.body;

    // Populate medicine + its pharmacy reference
    const cart = await Cart.findOne({ user: req.userId })
      .populate({
        path: "items.medicine",
        populate: { path: "pharmacy" },
      });

    if (!cart || cart.items.length === 0)
      return res.status(400).json({ message: "Cart is empty" });

    const pharmacyId = cart.items[0]?.medicine?.pharmacy?._id || null;
    console.log("items", cart.items)
    const order = new Order({
      user: req.userId,
      items: cart.items.map((i) => ({
        medicine: i.medicine._id,
        quantity: i.quantity,
        name : i.medicine.name,
        price: i.price,
      })),
      totalPrice: cart.totalPrice,
      pharmacy: pharmacyId, // ✅ ObjectId reference
      paymentMethod,
    });

   
    await order.save();
    await Cart.findOneAndDelete({ user: req.userId });

    res.json({ message: "Order created successfully", order });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ message: "Failed to create order", error: err.message });
  }
});


// ✅ Get all orders for a user
router.get('/', auth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.userId })
      .populate('items.medicine')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch orders', error: err.message });
  }
});

// recieve orders for pharmacies 

router.get("/order", async(req, res)=>{


    const orders = await Order.find()

    res.json(orders)


})

// ✅ Get single order
router.get('/:id', auth, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.userId })
      .populate('items.medicine');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch order', error: err.message });
  }
});

// ✅ Admin: Update order status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Emit real-time delivery update to the patient
    try {
      const io = getIO();
      if (io && order.user) {
        io.to(String(order.user)).emit('orderDeliveryUpdate', {
          orderId: String(order._id),
          status: order.status,
          userId: String(order.user),
        });
      }
    } catch (emitErr) {
      console.error('Failed to emit orderDeliveryUpdate:', emitErr.message);
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update order status', error: err.message });
  }
});

// ✅ Admin: Delete order
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Order.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Order not found' });
    res.json({ message: 'Order deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete order', error: err.message });
  }
});

module.exports = router;
