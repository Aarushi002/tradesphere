import express from 'express';
import Stock from '../models/Stock.js';

const router = express.Router();

// GET /api/stocks - list all stocks (for MVP we return seeded or empty; frontend can still call)
router.get('/', async (req, res) => {
  try {
    const stocks = await Stock.find().sort({ symbol: 1 });
    res.json(stocks);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to get stocks' });
  }
});

// GET /api/stocks/:symbol - get one stock by symbol
router.get('/:symbol', async (req, res) => {
  try {
    const stock = await Stock.findOne({ symbol: req.params.symbol.toUpperCase() });
    if (!stock) return res.status(404).json({ error: 'Stock not found' });
    res.json(stock);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to get stock' });
  }
});

export default router;
