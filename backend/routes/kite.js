import express from 'express';
import { KiteConnect } from 'kiteconnect';
import { auth } from '../middleware/auth.js';

const router = express.Router();

const apiKey = process.env.KITE_API_KEY;
const accessToken = process.env.KITE_ACCESS_TOKEN;

let kite;
function getKite() {
  if (!kite) {
    kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);
  }
  return kite;
}

function requireKite(req, res, next) {
  if (!apiKey || !accessToken) {
    return res.status(503).json({
      error: 'Kite not configured',
      message: 'Set KITE_API_KEY and KITE_ACCESS_TOKEN in backend .env',
    });
  }
  next();
}

// GET /api/kite/positions - live positions from Kite
router.get('/positions', auth, requireKite, async (req, res) => {
  try {
    const kc = getKite();
    const data = await kc.getPositions();
    const positions = (data && data.net) ? data.net : [];
    res.json({ positions: Array.isArray(positions) ? positions : [] });
  } catch (err) {
    console.error('Kite positions error', err?.message || err);
    res.status(500).json({
      error: err?.message || 'Failed to fetch positions',
      details: err?.data || err?.response || null,
    });
  }
});

// GET /api/kite/orders - live orders from Kite
router.get('/orders', auth, requireKite, async (req, res) => {
  try {
    const kc = getKite();
    const data = await kc.getOrders();
    const orders = Array.isArray(data) ? data : (data && data.data ? data.data : []);
    res.json({ orders: Array.isArray(orders) ? orders : [] });
  } catch (err) {
    console.error('Kite orders error', err?.message || err);
    res.status(500).json({
      error: err?.message || 'Failed to fetch orders',
      details: err?.data || err?.response || null,
    });
  }
});

// GET /api/kite/margins - equity/commodity margins
router.get('/margins', auth, requireKite, async (req, res) => {
  try {
    const kc = getKite();
    const segment = req.query.segment || '';
    const data = segment ? await kc.getMargins(segment) : await kc.getMargins();
    res.json(data || {});
  } catch (err) {
    console.error('Kite margins error', err?.message || err);
    res.status(500).json({
      error: err?.message || 'Failed to fetch margins',
      details: err?.data || err?.response || null,
    });
  }
});

// F&O rules: NFO requires MIS/NRML; options (CE/PE) require LIMIT with price
function isOptionSymbol(tradingsymbol) {
  const s = String(tradingsymbol || '').toUpperCase();
  return /CE$/.test(s) || /PE$/.test(s);
}

// POST /api/kite/order - place order (equity, options, futures)
// Body: { variety: 'regular', exchange, tradingsymbol, transaction_type: 'BUY'|'SELL', quantity, order_type: 'MARKET'|'LIMIT', product: 'CNC'|'MIS'|'NRML', price?, trigger_price? }
router.post('/order', auth, requireKite, async (req, res) => {
  try {
    const {
      variety = 'regular',
      exchange,
      tradingsymbol,
      transaction_type,
      quantity,
      order_type = 'MARKET',
      product = 'CNC',
      price,
      trigger_price,
      validity = 'DAY',
      disclosed_quantity,
    } = req.body;

    if (!exchange || !tradingsymbol || !transaction_type || !quantity || quantity < 1) {
      return res.status(400).json({
        error: 'Missing or invalid: exchange, tradingsymbol, transaction_type, quantity (>= 1)',
      });
    }

    const ex = exchange.toUpperCase();
    const trSymbol = String(tradingsymbol).trim();
    let orderType = (order_type || 'MARKET').toUpperCase();
    let productType = (product || 'CNC').toUpperCase();

    if (ex === 'NFO') {
      if (productType !== 'MIS' && productType !== 'NRML') {
        return res.status(400).json({
          error: 'F&O orders require product MIS (intraday) or NRML (overnight)',
        });
      }
      if (isOptionSymbol(trSymbol)) {
        if (orderType !== 'LIMIT') {
          return res.status(400).json({
            error: 'Options allow only LIMIT orders. Please enter a price.',
          });
        }
        const priceNum = price != null ? Number(price) : NaN;
        if (!Number.isFinite(priceNum) || priceNum <= 0) {
          return res.status(400).json({
            error: 'Options require a valid limit price.',
          });
        }
      }
    }

    const params = {
      exchange: ex,
      tradingsymbol: trSymbol,
      transaction_type: transaction_type.toUpperCase(),
      quantity: Math.floor(Number(quantity)),
      order_type: orderType,
      product: productType,
      validity: (validity || 'DAY').toUpperCase(),
    };

    if (params.order_type === 'LIMIT' && price != null) params.price = Number(price);
    if (trigger_price != null) params.trigger_price = Number(trigger_price);
    if (disclosed_quantity != null) params.disclosed_quantity = Math.floor(Number(disclosed_quantity));

    const kc = getKite();
    const result = await kc.placeOrder(variety, params);
    res.status(201).json({
      message: 'Order placed',
      order_id: result?.order_id,
      data: result,
    });
  } catch (err) {
    console.error('Kite place order error', err?.message || err, err?.data || err?.response);
    res.status(500).json({
      error: err?.message || 'Order failed',
      details: err?.data || err?.response || null,
    });
  }
});

// --- Mutual funds ---

// GET /api/kite/mf/holdings
router.get('/mf/holdings', auth, requireKite, async (req, res) => {
  try {
    const kc = getKite();
    const data = await kc.getMFHoldings();
    const list = Array.isArray(data) ? data : (data?.data || []);
    res.json({ holdings: list });
  } catch (err) {
    console.error('Kite MF holdings error', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to fetch MF holdings' });
  }
});

// GET /api/kite/mf/orders
router.get('/mf/orders', auth, requireKite, async (req, res) => {
  try {
    const kc = getKite();
    const orderId = req.query.order_id;
    const data = orderId ? await kc.getMFOrders(orderId) : await kc.getMFOrders();
    const list = Array.isArray(data) ? data : (data?.data ? (Array.isArray(data.data) ? data.data : [data.data]) : []);
    res.json({ orders: list });
  } catch (err) {
    console.error('Kite MF orders error', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to fetch MF orders' });
  }
});

// GET /api/kite/mf/sips
router.get('/mf/sips', auth, requireKite, async (req, res) => {
  try {
    const kc = getKite();
    const data = await kc.getMFSIPS();
    const list = Array.isArray(data) ? data : (data?.data || []);
    res.json({ sips: list });
  } catch (err) {
    console.error('Kite MF SIPs error', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to fetch MF SIPs' });
  }
});

// POST /api/kite/mf/order - place MF order (BUY: amount in ₹, SELL: quantity)
// Note: Zerodha may require payment from bank; order might not execute via API.
router.post('/mf/order', auth, requireKite, async (req, res) => {
  try {
    const { tradingsymbol, transaction_type, amount, quantity, tag } = req.body;
    if (!tradingsymbol || !transaction_type) {
      return res.status(400).json({ error: 'tradingsymbol and transaction_type (BUY/SELL) required' });
    }
    const txn = transaction_type.toUpperCase();
    const params = { tradingsymbol: String(tradingsymbol).trim(), transaction_type: txn };
    if (txn === 'BUY') {
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt < 0) return res.status(400).json({ error: 'BUY requires amount (₹)' });
      params.amount = amt;
    } else {
      const qty = Number(quantity);
      if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: 'SELL requires quantity' });
      params.quantity = qty;
    }
    if (tag != null) params.tag = String(tag).slice(0, 8);
    const kc = getKite();
    const result = await kc.placeMFOrder(params);
    res.status(201).json({ message: 'MF order placed', data: result });
  } catch (err) {
    console.error('Kite MF order error', err?.message || err);
    res.status(500).json({
      error: err?.message || 'MF order failed',
      details: err?.data || err?.response || null,
    });
  }
});

export default router;
