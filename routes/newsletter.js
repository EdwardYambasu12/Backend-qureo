const Newsletter = require("../models/Newletter");
const express = require("express");
const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const newsletters = await Newsletter.find();
        res.json(newsletters);
    } catch (err) {
        res.status(500).json({ message: "Failed to get newsletters", error: err.message });
    }
});

router.post("/", async (req, res) => {
    try {
        const newsletter = await Newsletter.create(req.body);
        res.json(newsletter);
    } catch (err) {
        res.status(500).json({ message: "Failed to create newsletter", error: err.message });
    }
});

// ✅ ADD THIS LINE
module.exports = router;