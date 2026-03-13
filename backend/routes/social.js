import express from 'express';
import Post from '../models/Post.js';
import Comment from '../models/Comment.js';
import User from '../models/User.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

// POST /api/social/posts - create a post (auth required)
router.post('/posts', auth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }
    const post = await Post.create({ user: req.userId, content: content.trim() });
    const populated = await Post.findById(post._id).populate('user', 'name email');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to create post' });
  }
});

// GET /api/social/feed - list posts (newest first)
router.get('/feed', async (req, res) => {
  try {
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('user', 'name email');
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to get feed' });
  }
});

// POST /api/social/posts/:postId/comments - add comment (auth required)
router.post('/posts/:postId/comments', auth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }
    const comment = await Comment.create({
      post: req.params.postId,
      user: req.userId,
      content: content.trim(),
    });
    const populated = await Comment.findById(comment._id).populate('user', 'name email');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to add comment' });
  }
});

// GET /api/social/posts/:postId/comments - list comments for a post
router.get('/posts/:postId/comments', async (req, res) => {
  try {
    const comments = await Comment.find({ post: req.params.postId })
      .sort({ createdAt: 1 })
      .populate('user', 'name email');
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to get comments' });
  }
});

export default router;
