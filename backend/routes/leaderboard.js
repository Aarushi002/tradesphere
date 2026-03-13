import express from 'express';
import User from '../models/User.js';
import Holding from '../models/Holding.js';
import Stock from '../models/Stock.js';

const router = express.Router();

// GET /api/leaderboard - top users by portfolio value (cash + holdings)
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const users = await User.find().select('name email tradingId cashBalance');
    const results = [];

    for (const u of users) {
      const holdings = await Holding.find({ user: u._id });
      let holdingsValue = 0;
      for (const h of holdings) {
        const stock = await Stock.findOne({ symbol: h.symbol });
        const price = stock ? stock.lastPrice : h.avgBuyPrice;
        holdingsValue += h.quantity * price;
      }
      const portfolioValue = u.cashBalance + holdingsValue;
      results.push({
        userId: u._id,
        name: u.name,
        tradingId: u.tradingId,
        email: u.email,
        portfolioValue: Math.round(portfolioValue * 100) / 100,
      });
    }

    results.sort((a, b) => b.portfolioValue - a.portfolioValue);
    res.json(results.slice(0, limit));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to get leaderboard' });
  }
});

export default router;
