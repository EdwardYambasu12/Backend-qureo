const express = require("express");
const router = express.Router();
const Provider = require("../models/Provider");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "supersecret123";

// REGISTER new provider
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, phone, address, logo } = req.body;

    const existing = await Provider.findOne({ email });
    if (existing)
      return res.status(400).json({ error: "Email already registered" });

    const provider = await Provider.create({
      name,
      email,
      password,
      phone,
      address,
      logo,
    });

    const token = jwt.sign({ id: provider._id }, JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({
      success: true,
      message: "Provider registered successfully",
      token,
      provider: {
        id: provider._id,
        name: provider.name,
        email: provider.email,
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({
      error: "Failed to register provider",
      details: err.message,
    });
  }
});

// LOGIN provider
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const provider = await Provider.findOne({ email });

    if (!provider) return res.status(404).json({ error: "Provider not found" });

    const isMatch = await provider.matchPassword(password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: provider._id }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      success: true,
      message: "Login successful",
      token,
      provider: {
        id: provider._id,
        name: provider.name,
        email: provider.email,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({
      error: "Failed to login provider",
      details: err.message,
    });
  }
});

// 🔍 FIND provider by ID
router.get("/:id", async (req, res) => {
  try {
    const provider = await Provider.findById(req.params.id);

    if (!provider)
      return res.status(404).json({ error: "Provider not found" });

    res.json({
      success: true,
      provider,
    });
  } catch (err) {
    console.error("Find provider error:", err);
    res.status(500).json({
      error: "Failed to fetch provider",
      details: err.message,
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const providers = await Provider.find();
    res.json({ providers });
  } catch (err) {
    console.error("Fetch providers error:", err);
    res.status(500).json({
        error: "Failed to fetch providers",
        details: err.message,
    });
    }
});
module.exports = router;
