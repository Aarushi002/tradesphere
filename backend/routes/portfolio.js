import express from 'express';
import User from '../models/User.js';
import Holding from '../models/Holding.js';
import Stock from '../models/Stock.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/portfolio
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('name email tradingId cashBalance');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const holdings = await Holding.find({ user: req.userId });
    const results = [];
    let totalValue = 0;

    for (const h of holdings) {
      const stock = await Stock.findOne({ symbol: h.symbol });
      const currentPrice = stock ? stock.lastPrice : h.avgBuyPrice;
      const value = h.quantity * currentPrice;
      totalValue += value;
      results.push({
        symbol: h.symbol,
        quantity: h.quantity,
        avgBuyPrice: h.avgBuyPrice,
        currentPrice,
        value,
        unrealizedPnl: (currentPrice - h.avgBuyPrice) * h.quantity,
      });
    }

    const portfolioValue = user.cashBalance + totalValue;

    res.json({
      user: { name: user.name, email: user.email, tradingId: user.tradingId, cashBalance: user.cashBalance },
      holdings: results,
      portfolioValue,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to get portfolio' });
  }
});

export default router;
