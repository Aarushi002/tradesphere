import crypto from 'crypto';
import express from 'express';
import { KiteConnect } from 'kiteconnect';
import { auth } from '../middleware/auth.js';
import { optionalAuth } from '../middleware/auth.js';
import { getAccessToken, setAccessToken, getMarketDataToken, setMarketDataToken } from '../src/lib/kiteToken.js';

const router = express.Router();

const apiKey = process.env.KITE_API_KEY;
const apiSecret = process.env.KITE_API_SECRET;

function getKite(userId) {
  const accessToken = getAccessToken(userId);
  if (!apiKey || !accessToken) return null;
  const kc = new KiteConnect({ api_key: apiKey });
  kc.setAccessToken(accessToken);
  return kc;
}

function requireKite(req, res, next) {
  if (!apiKey) {
    return res.status(503).json({
      error: 'Kite not configured',
      message: 'Set KITE_API_KEY (and KITE_API_SECRET) in backend .env',
    });
  }
  if (!getAccessToken(req.userId)) {
    return res.status(503).json({
      error: 'Link your Zerodha account',
      message: 'For real trading only. Paper trading uses app data.',
      code: 'KITE_SESSION_EXPIRED',
    });
  }
  next();
}

// GET /api/kite/login - No auth: state=market (app-level market data for paper trading). With auth: state=userId (per-user for real broker).
router.get('/login', optionalAuth, (req, res) => {
  if (!apiKey) {
    return res.status(503).json({ error: 'Set KITE_API_KEY in backend .env' });
  }
  const statePlain = req.userId ? String(req.userId) : 'market';
  const stateB64 = Buffer.from(statePlain, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const url = `https://kite.zerodha.com/connect/login?v=3&api_key=${encodeURIComponent(apiKey)}&state=${encodeURIComponent(stateB64)}`;
  res.redirect(302, url);
});

// GET /api/kite/callback - state=market → set global market data token; else state=userId → set per-user token
router.get('/callback', async (req, res) => {
  const requestToken = (req.query.request_token || '').toString().trim();
  const stateRaw = (req.query.state || '').toString().trim();
  const frontendUrl = process.env.KITE_FRONTEND_URL || process.env.FRONTEND_URL || 'http://localhost:3000';

  if (!apiKey || !apiSecret) {
    return res.redirect(`${frontendUrl}?kite_error=missing_api_secret`);
  }
  if (!requestToken) {
    return res.redirect(`${frontendUrl}?kite_error=missing_request_token`);
  }

  let stateValue = null;
  if (stateRaw) {
    try {
      const b64 = stateRaw.replace(/-/g, '+').replace(/_/g, '/');
      stateValue = Buffer.from(b64, 'base64').toString('utf8');
    } catch (_) {}
  }
  if (!stateValue) {
    return res.redirect(`${frontendUrl}?kite_error=invalid_state`);
  }

  const checksum = crypto.createHash('sha256').update(apiKey + requestToken + apiSecret).digest('hex');
  const body = new URLSearchParams({
    api_key: apiKey,
    request_token: requestToken,
    checksum,
  }).toString();

  try {
    const response = await fetch('https://api.kite.trade/session/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Kite-Version': '3',
      },
      body,
    });
    const json = await response.json();
    const accessToken = json?.data?.access_token || json?.access_token;

    if (accessToken) {
      if (stateValue === 'market') {
        setMarketDataToken(accessToken);
        console.log('[kite] Market data token set (app-level). All users will see real-time data.');
      } else {
        setAccessToken(stateValue, accessToken);
        console.log('[kite] Access token set for user', stateValue);
      }
      return res.redirect(`${frontendUrl}?kite_refreshed=1`);
    }
    const errMsg = json?.message || json?.error_type || 'Unknown error';
    return res.redirect(`${frontendUrl}?kite_error=${encodeURIComponent(errMsg)}`);
  } catch (err) {
    console.error('[kite] Callback error', err?.message || err);
    return res.redirect(`${frontendUrl}?kite_error=${encodeURIComponent(err?.message || 'Request failed')}`);
  }
});

// GET /api/kite/status - Market data: no auth, returns whether app has Kite connected for real-time data
router.get('/status', (req, res) => {
  const hasMarketData = !!getMarketDataToken();
  res.json({
    configured: !!apiKey,
    hasSession: hasMarketData,
    loginUrl: apiKey ? `/api/kite/login` : null,
  });
});

// GET /api/kite/positions - live positions from Kite
router.get('/positions', auth, requireKite, async (req, res) => {
  try {
    const kc = getKite(req.userId);
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
    const kc = getKite(req.userId);
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
    const kc = getKite(req.userId);
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

    const kc = getKite(req.userId);
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
    const kc = getKite(req.userId);
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
    const kc = getKite(req.userId);
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
    const kc = getKite(req.userId);
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
    const kc = getKite(req.userId);
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
