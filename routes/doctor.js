const express = require("express");
const router = express.Router();
const Doctor = require("../models/Doctor");
const bcrypt = require("bcryptjs");

// ✅ Register Doctor
// ✅ Register Doctor
router.post("/", async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      specialty,
      experience,
      avatar,
      city,
      description,
      certified,
      skills,
      languagesSpoken,
      availability,
      education,
      location // optional: { latitude, longitude }
    } = req.body;

    // Check if doctor already exists
    const existing = await Doctor.findOne({ email });
    if (existing) return res.status(400).json({ message: "Doctor already exists" });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Build new doctor object
    const newDoctor = new Doctor({
      name,
      email,
      phone,
      password: hashedPassword,
      specialty,
      experience,
      avatar,
      city,
      description,
      certified: certified || false,
      skills: skills || [],
      languagesSpoken: languagesSpoken || [],
      availability: availability || {},
      education: education || [],
      location: location
        ? { type: "Point", coordinates: [location.longitude, location.latitude] }
        : { type: "Point", coordinates: [0, 0] }, // default coordinates
    });

    // Save to database
    await newDoctor.save();

    res.status(201).json({ message: "Doctor registered successfully", doctor: newDoctor });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});



// POST /api/doctor/bulk
router.post("/bulk", async (req, res) => {
    console.log("bulk")
  try {

    const doctors = req.body; // expecting an array
    const created = await Doctor.insertMany(doctors);
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to insert doctors" });
  }
});

// ✅ UPDATE doctor location
router.put("/:id/location", async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (!latitude || !longitude) {
      return res.status(400).json({ message: "Latitude and longitude required" });
    }

    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });

    doctor.location = {
      type: 'Point',
      coordinates: [longitude, latitude], // GeoJSON requires [lng, lat]
    };

    await doctor.save();
    res.json({ message: "Location updated", location: doctor.location });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ FIND doctors near a location
// Query params: ?lat=...&lng=...&radius=km
router.get("/nearby", async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;
    // validate numeric query params
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return res.status(400).json({ message: "Invalid latitude or longitude" });
    }

    const radiusNum = parseFloat(radius);
    const distance = (Number.isFinite(radiusNum) ? radiusNum : 5) * 1000; // convert km to meters

    const doctors = await Doctor.find({
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [lngNum, latNum],
          },
          $maxDistance: distance,
        },
      },
    });

    res.json(doctors);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch nearby doctors" });
  }
});

// GET /api/doctors/search?query=keyword
router.get("/search", async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ message: "Query parameter is required" });
    }

    // Case-insensitive partial match for multiple fields
    const regex = new RegExp(query, "i");

    const doctors = await Doctor.find({
      $or: [
        { name: regex },
        { specialty: regex },
        { city: regex },
        { skills: regex },
      ],
    });

    res.json({ results: doctors });
  } catch (err) {
    console.error("❌ Error searching doctors:", err);
    res.status(500).json({ message: "Failed to search doctors" });
  }
});


router.get("/specialty/:specialty",  async (req, res) => {
  try {
    const { specialty } = req.params;
    const doctors = await Doctor.find({ specialty: { $regex: new RegExp(specialty, "i") } }); // case-insensitive search
    res.json(doctors);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch doctors", error: err.message });
  }
});



// ✅ Get All Doctors
router.get("/", async (req, res) => {
  try {
    const doctors = await Doctor.find();
    res.json(doctors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
router.get('/delete', async (req, res) => {
  try {
    const result = await Doctor.deleteMany({});
    console.log('Doctor collection cleared');
    res.status(200).json({ message: 'All doctors deleted', deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Error deleting doctors:', error);
    res.status(500).json({ error: 'Failed to delete doctors' });
  }
});


// ✅ Delete Doctor by ID
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Doctor.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Doctor not found" });
    res.json({ message: "Doctor deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ Add Comment
router.post("/:id/comment", async (req, res) => {
  const { user, comment } = req.body;

  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    // Initialize comments if undefined
    if (!Array.isArray(doctor.comments)) {
      doctor.comments = [];
    }

    doctor.comments.push({
      user,
      comment,
      date: new Date(),
    });

    await doctor.save();
    res.json({
      message: "Comment added successfully",
      doctor,
    });
  } catch (err) {
    console.error("❌ Error adding comment:", err);
    res.status(500).json({ message: "Failed to add comment", error: err.message });
  }
});
router.get("/:id", async (req, res) => {
  const { id } = req.params;



  try {
    const doctor = await Doctor.findById(id).lean();
    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }
    res.json(doctor);
  } catch (err) {
    console.error("Error fetching doctor:", err);
    res.status(500).json({ message: "Server error" });
  }
});



// ✅ Update Certification, Skills, or More Options
router.put("/:id/update", async (req, res) => {
  try {
    const updates = req.body; // e.g. { certified: true, skills: ["Surgery", "Cardiology"], moreOptions: { language: "English" } }
    const doctor = await Doctor.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });
    res.json({ message: "Doctor updated", doctor });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});



module.exports = router;
