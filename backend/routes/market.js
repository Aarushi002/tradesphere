import express from 'express';
import { KiteConnect } from 'kiteconnect';

const router = express.Router();

const apiKey = process.env.KITE_API_KEY;
const accessToken = process.env.KITE_ACCESS_TOKEN;

// Lazy-init Kite client
let kite;
function getKite() {
  if (!kite) {
    kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);
  }
  return kite;
}

// Basic mapping for a few instruments. For production you should
// load the full instruments list and look up tokens dynamically.
const INSTRUMENT_TOKENS = {
  NIFTY50: 256265,
  NIFTY_BANK: 260105,
  RELIANCE: 738561,
  HDFCBANK: 341249, // tokens can change; verify with Kite instruments dump
};

// GET /api/market/candles?symbol=NIFTY50&interval=5minute
router.get('/candles', async (req, res) => {
  try {
    const { symbol = 'NIFTY50', interval = '5minute' } = req.query;
    const token = INSTRUMENT_TOKENS[symbol.toUpperCase()];
    if (!token) {
      return res.status(400).json({ error: 'Unsupported symbol' });
    }

    const now = new Date();
    const from = new Date(now.getTime() - 60 * 60 * 1000); // last 60 minutes

    const kc = getKite();
    const candles = await kc.getHistoricalData(
      token,
      interval,
      from.toISOString(),
      now.toISOString(),
      false,
      false
    );

    // Normalize to a simple structure for the frontend chart
    const data = candles.map((c) => ({
      time: new Date(c.date).getTime() / 1000, // seconds for TradingView-style charts
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));

    res.json({ symbol, interval, data });
  } catch (err) {
    console.error('Error fetching candles', err?.message || err);
    res.status(500).json({
      error: err?.message || 'Failed to fetch candles',
      details: err?.data || err?.response || null,
    });
  }
});

export default router;
