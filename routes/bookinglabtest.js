const express = require("express");

const Booking = require("../models/BookingLabtest.js");
const LabTest = require("../models/LabTest.js");
const router = express.Router();


// 🧍 USER: Create a new booking
router.post("/", async (req, res) => {
  try {
    const { user, tests, items, preferredDate, collectionMethod } = req.body;

    // Support both names
    const labTests = tests || items;
    if (!labTests || !Array.isArray(labTests) || labTests.length === 0) {
      return res.status(400).json({ success: false, message: "No lab tests provided." });
    }

    // Fetch details from LabTest collection
    const fullTests = [];
    let totalAmount = 0;

    for (const t of labTests) {
      const found = await LabTest.findById(t.testId);
      if (!found) continue;

      const fullTest = {
        testId: found._id,
        name: found.name,
        price: found.price,
        category: found.category,
        qty: t.qty || 1,
      };

      totalAmount += found.price * (t.qty || 1);
      fullTests.push(fullTest);
    }

    if (fullTests.length === 0) {
      return res.status(400).json({ success: false, message: "No valid tests found." });
    }

    const booking = new Booking({
      user,
      tests: fullTests,
      preferredDate,
      collectionMethod,
      totalAmount,
    });

    await booking.save();

    res.status(201).json({ success: true, booking });
  } catch (error) {
    console.error("Error creating booking:", error);
    res.status(500).json({ success: false, message: "Server Error", details: error.message });
  }
});



// 📜 USER: Get all bookings for a user
router.get("/user/:userId", async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.params.userId })
      .populate("user")
      .populate("assignedAttendant")
      .populate("tests.testId");

    res.json({ success: true, bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch bookings" });
  }
});


// 🧾 ADMIN: Get all bookings
router.get("/", async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate("user")
      .populate("assignedAttendant")
      .populate("tests.testId");
    res.json({ success: true, bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch all bookings" });
  }
});


// 🧬 ADMIN: Update booking status
router.put("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    res.json({ success: true, booking });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update status" });
  }
});


// 🧫 ADMIN: Update specimen info for a test
router.put("/:bookingId/test/:testId/specimen", async (req, res) => {
  try {
    const { bookingId, testId } = req.params;
    const { specimen } = req.body; // collectedBy, collectedAt, condition, notes

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    const test = booking.tests.find(
      (t) => t.testId.toString() === testId.toString()
    );
    if (!test) return res.status(404).json({ message: "Test not found in booking" });

    test.specimen = specimen;
    await booking.save();

    res.json({ success: true, booking });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update specimen" });
  }
});


// 📄 ADMIN: Upload result for a test
router.put("/:bookingId/test/:testId/result", async (req, res) => {
  const { bookingId, testId } = req.params;
  const { resultFile, remarks, status } = req.body.result; // resultFile = Cloudinary URL
  console.log(req.body);
  try {
    const booking = await Booking.findById(bookingId).populate("user");
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    const test = booking.tests.id(testId); // Mongoose subdocument helper
    if (!test) return res.status(404).json({ message: "Test not found in booking" });

    // Update test result
    test.result = {
      resultFile,          // Cloudinary URL
      remarks: remarks || "",
      status: status || "completed",
      uploadedAt: new Date(),
      releasedAt: new Date(),
    };

    // Also update the test status in the booking
    test.status = status || "completed";

    await booking.save();

   
    res.json({ success: true, message: "Result uploaded, status updated, and email sent", booking });
  } catch (err) {
    console.error("Error uploading result:", err);
    res.status(500).json({ success: false, message: "Failed to upload result" });
  }
});



// 👀 USER: View a single booking
router.get("/:id", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("user")
      .populate("assignedAttendant")
      .populate("tests.testId");

    if (!booking) return res.status(404).json({ message: "Booking not found" });

    res.json({ success: true, booking });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch booking" });
  }
});


module.exports = router;
