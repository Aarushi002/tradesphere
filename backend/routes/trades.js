import express from 'express';
import Trade from '../models/Trade.js';
import Holding from '../models/Holding.js';
import User from '../models/User.js';
import Stock from '../models/Stock.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/trades - list user's orders/trades
router.get('/', auth, async (req, res) => {
  try {
    const trades = await Trade.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json(trades);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch trades' });
  }
});

async function getPrice(symbol) {
  let stock = await Stock.findOne({ symbol: symbol.toUpperCase() });
  if (!stock) {
    stock = await Stock.create({
      symbol: symbol.toUpperCase(),
      name: symbol,
      lastPrice: 100,
    });
  }
  return stock.lastPrice;
}

// POST /api/trades/buy
router.post('/buy', auth, async (req, res) => {
  try {
    const { symbol, quantity } = req.body;
    if (!symbol || !quantity || quantity < 1) {
      return res.status(400).json({ error: 'Symbol and quantity (>= 1) required' });
    }
    const qty = Math.floor(Number(quantity));
    const price = await getPrice(symbol);
    const totalAmount = price * qty;

    const user = await User.findById(req.userId);
    if (user.cashBalance < totalAmount) {
      return res.status(400).json({ error: 'Insufficient cash' });
    }

    await Trade.create({
      user: req.userId,
      symbol: symbol.toUpperCase(),
      side: 'buy',
      quantity: qty,
      price,
      totalAmount,
    });

    let holding = await Holding.findOne({ user: req.userId, symbol: symbol.toUpperCase() });
    if (!holding) {
      holding = await Holding.create({
        user: req.userId,
        symbol: symbol.toUpperCase(),
        quantity: qty,
        avgBuyPrice: price,
      });
    } else {
      const newTotal = holding.quantity * holding.avgBuyPrice + totalAmount;
      holding.quantity += qty;
      holding.avgBuyPrice = newTotal / holding.quantity;
      await holding.save();
    }

    user.cashBalance -= totalAmount;
    await user.save();

    res.status(201).json({
      message: 'Buy order filled',
      symbol: symbol.toUpperCase(),
      quantity: qty,
      price,
      totalAmount,
      cashBalance: user.cashBalance,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Buy failed' });
  }
});

// POST /api/trades/sell
router.post('/sell', auth, async (req, res) => {
  try {
    const { symbol, quantity } = req.body;
    if (!symbol || !quantity || quantity < 1) {
      return res.status(400).json({ error: 'Symbol and quantity (>= 1) required' });
    }
    const qty = Math.floor(Number(quantity));
    const price = await getPrice(symbol);
    const totalAmount = price * qty;

    const holding = await Holding.findOne({ user: req.userId, symbol: symbol.toUpperCase() });
    if (!holding || holding.quantity < qty) {
      return res.status(400).json({ error: 'Insufficient shares to sell' });
    }

    await Trade.create({
      user: req.userId,
      symbol: symbol.toUpperCase(),
      side: 'sell',
      quantity: qty,
      price,
      totalAmount,
    });

    holding.quantity -= qty;
    if (holding.quantity === 0) await Holding.deleteOne({ _id: holding._id });
    else await holding.save();

    const user = await User.findById(req.userId);
    user.cashBalance += totalAmount;
    await user.save();

    res.json({
      message: 'Sell order filled',
      symbol: symbol.toUpperCase(),
      quantity: qty,
      price,
      totalAmount,
      cashBalance: user.cashBalance,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Sell failed' });
  }
});

export default router;
