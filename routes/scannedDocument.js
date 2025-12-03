const express = require("express");
const ScannedDocument = require("../models/ScannedDocuments.js");
const router = express.Router();

router.post("/upload", async (req, res) => {
  try {
    const { title, description, fileUrl, user_id, fileType } = req.body;

    console.log(req.body, "Received upload request");


    const doc = await ScannedDocument.create({
      user_id,
      title,
      description,
      fileUrl,
      fileType,
    });

    res.status(201).json({ success: true, document: doc });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Upload failed" });
  }
});

router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const documents = await ScannedDocument.find({ user_id: userId }).sort({ createdAt: -1 });
    res.json({ success: true, documents });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to fetch documents" });
  }     
});

module.exports = router;
