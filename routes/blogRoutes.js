const express = require("express");
const Blog = require("../models/Blog");

const router = express.Router();

// 📝 Create new blog
router.post("/", async (req, res) => {
  try {
    const { title, content, mediaType, mediaUrl, author, category, tags } = req.body;

    const newBlog = await Blog.create({
      title,
      content,
      mediaType,
      mediaUrl,
      author,
      category,
      tags,
    });

    res.status(201).json({ message: "Blog created successfully", blog: newBlog });
  } catch (error) {
    res.status(500).json({ message: "Error creating blog", error: error.message });
  }
});

// 📚 Get all blogs
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(100, parseInt(req.query.limit || '10'));
    const q = (req.query.q || '').trim();
    const category = req.query.category;

    const filter = {};
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { title: { $regex: re } },
        { content: { $regex: re } },
        { tags: { $in: [re] } },
      ];
    }
    if (category) filter.category = category;

    const total = await Blog.countDocuments(filter);
    const blogs = await Blog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({ blogs, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ message: "Error fetching blogs", error: error.message });
  }
});

// 🔍 Get blog by ID
router.get("/:id", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog not found" });
    res.json(blog);
  } catch (error) {
    res.status(500).json({ message: "Error fetching blog", error: error.message });
  }
});

// ✏️ Update blog
router.put("/:id", async (req, res) => {
  try {
    const updated = await Blog.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ message: "Blog not found" });
    res.json({ message: "Blog updated successfully", blog: updated });
  } catch (error) {
    res.status(500).json({ message: "Error updating blog", error: error.message });
  }
});

// 🗑️ Delete blog
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Blog.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Blog not found" });
    res.json({ message: "Blog deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting blog", error: error.message });
  }
});


module.exports = router;
