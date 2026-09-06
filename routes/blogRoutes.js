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

// ❤️ Toggle like
router.post("/:id/like", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog not found" });
    const userId = req.body.userId;
    if (!userId) return res.status(400).json({ message: "userId is required" });

    const idx = blog.likes.indexOf(userId);
    if (idx === -1) blog.likes.push(userId);
    else blog.likes.splice(idx, 1);

    await blog.save();
    res.json({ liked: idx === -1, likes: blog.likes });
  } catch (error) {
    res.status(500).json({ message: "Error toggling like", error: error.message });
  }
});

// 📤 Increment share count
router.post("/:id/share", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog not found" });
    blog.shares = (blog.shares || 0) + 1;
    await blog.save();
    res.json({ shares: blog.shares });
  } catch (error) {
    res.status(500).json({ message: "Error sharing", error: error.message });
  }
});

// 🔖 Toggle save
router.post("/:id/save", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog not found" });
    const userId = req.body.userId;
    if (!userId) return res.status(400).json({ message: "userId is required" });

    const idx = blog.saves.indexOf(userId);
    if (idx === -1) blog.saves.push(userId);
    else blog.saves.splice(idx, 1);

    await blog.save();
    res.json({ saved: idx === -1, saves: blog.saves });
  } catch (error) {
    res.status(500).json({ message: "Error toggling save", error: error.message });
  }
});

// 💬 Add comment
router.post("/:id/comments", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog not found" });
    const { userId, userName, text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ message: "Comment text is required" });

    blog.comments.push({
      userId: userId || null,
      userName: userName || "Anonymous",
      text: text.trim(),
    });

    await blog.save();
    res.status(201).json({ comment: blog.comments[blog.comments.length - 1], comments: blog.comments });
  } catch (error) {
    res.status(500).json({ message: "Error adding comment", error: error.message });
  }
});

// 💬 Get comments
router.get("/:id/comments", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog not found" });
    res.json({ comments: blog.comments });
  } catch (error) {
    res.status(500).json({ message: "Error fetching comments", error: error.message });
  }
});

module.exports = router;
