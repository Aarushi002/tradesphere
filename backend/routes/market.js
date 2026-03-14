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

// Map display symbol (as shown in UI) to Kite exchange:tradingsymbol for quote API.
// NIFTY 50 and SENSEX are indices; rest are NSE equities.
function toKiteInstrumentKey(symbol) {
  const s = (symbol || '').toString().trim();
  if (!s) return null;
  const upper = s.toUpperCase();
  if (upper === 'NIFTY 50' || upper === 'NIFTY50') return 'NSE:NIFTY 50';
  if (upper === 'NIFTY BANK' || upper === 'NIFTYBANK') return 'NSE:NIFTY BANK';
  if (upper === 'SENSEX') return 'BSE:SENSEX';
  return 'NSE:' + s.replace(/\s+/g, '');
}

// Normalize Kite response key (e.g. "NSE:NIFTY 50") to display name.
function normalizeKiteKeyToName(kiteKey) {
  if (!kiteKey || typeof kiteKey !== 'string') return kiteKey;
  const parts = kiteKey.split(':');
  if (parts.length >= 2) {
    const sym = parts.slice(1).join(':').replace(/\s+/g, ' ').trim();
    if (sym === 'NIFTY 50') return 'NIFTY 50';
    if (sym === 'NIFTY BANK') return 'NIFTY BANK';
    if (sym === 'SENSEX') return 'SENSEX';
    return sym;
  }
  return kiteKey;
}

// In-memory instrument list for search (Zerodha-like suggestions). Cached for 24h.
let instrumentsCache = [];
let instrumentsCacheTime = 0;
const INSTRUMENTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Parse CSV string into array of objects (for NFO/MF when Kite returns raw CSV)
function parseCSVToArray(str) {
  if (typeof str !== 'string' || !str.trim()) return [];
  const lines = str.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.replace(/^\s*["']?|["']?\s*$/g, '').trim());
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map((v) => v.replace(/^\s*["']?|["']?\s*$/g, '').trim());
    const row = {};
    headers.forEach((h, j) => { row[h] = vals[j] != null ? vals[j] : ''; });
    out.push(row);
  }
  return out;
}

function ensureInstrumentArray(data) {
  if (Array.isArray(data)) return data;
  if (typeof data === 'string') return parseCSVToArray(data);
  return [];
}

// Fallback list when Kite instruments API is unavailable or not yet loaded (includes sample NFO futures)
const FALLBACK_INSTRUMENTS = [
  { exchange: 'NSE', tradingsymbol: 'RELIANCE', name: 'Reliance Industries', instrument_type: 'EQ', segment: 'NSE' },
  { exchange: 'NSE', tradingsymbol: 'TCS', name: 'Tata Consultancy Services', instrument_type: 'EQ', segment: 'NSE' },
  { exchange: 'NSE', tradingsymbol: 'INFY', name: 'Infosys', instrument_type: 'EQ', segment: 'NSE' },
  { exchange: 'NSE', tradingsymbol: 'HDFCBANK', name: 'HDFC Bank', instrument_type: 'EQ', segment: 'NSE' },
  { exchange: 'NSE', tradingsymbol: 'NIFTY 50', name: 'Nifty 50', instrument_type: 'INDEX', segment: 'NSE' },
  { exchange: 'BSE', tradingsymbol: 'SENSEX', name: 'SENSEX', instrument_type: 'INDEX', segment: 'BSE' },
  { exchange: 'NSE', tradingsymbol: 'SBIN', name: 'State Bank of India', instrument_type: 'EQ', segment: 'NSE' },
  { exchange: 'NSE', tradingsymbol: 'ICICIBANK', name: 'ICICI Bank', instrument_type: 'EQ', segment: 'NSE' },
  { exchange: 'NSE', tradingsymbol: 'TATAMOTORS', name: 'Tata Motors', instrument_type: 'EQ', segment: 'NSE' },
  { exchange: 'NSE', tradingsymbol: 'BHARTIARTL', name: 'Bharti Airtel', instrument_type: 'EQ', segment: 'NSE' },
  { exchange: 'NFO', tradingsymbol: 'NIFTY24MARFUT', name: 'Nifty 50 Futures', instrument_type: 'FUT', segment: 'NFO' },
  { exchange: 'NFO', tradingsymbol: 'BANKNIFTY24MARFUT', name: 'Bank Nifty Futures', instrument_type: 'FUT', segment: 'NFO' },
  { exchange: 'NFO', tradingsymbol: 'FINNIFTY24MARFUT', name: 'Nifty Financial Services Futures', instrument_type: 'FUT', segment: 'NFO' },
  { exchange: 'NSE', tradingsymbol: 'NIFTY BANK', name: 'Nifty Bank Index', instrument_type: 'INDEX', segment: 'NSE' },
  { exchange: 'MCX', tradingsymbol: 'GOLDM24NOV', name: 'Gold Mini', instrument_type: 'FUT', segment: 'MCX' },
  { exchange: 'MCX', tradingsymbol: 'SILVERM24DEC', name: 'Silver Mini', instrument_type: 'FUT', segment: 'MCX' },
  { exchange: 'MCX', tradingsymbol: 'CRUDEOILM24NOV', name: 'Crude Oil Mini', instrument_type: 'FUT', segment: 'MCX' },
];

async function loadInstruments() {
  if (Date.now() - instrumentsCacheTime < INSTRUMENTS_CACHE_TTL_MS && instrumentsCache.length > 0) {
    return instrumentsCache;
  }
  if (!apiKey || !accessToken) return FALLBACK_INSTRUMENTS;
  try {
    const kc = getKite();
    const [nse, nfo, bse, mcx, mf] = await Promise.all([
      kc.getInstruments('NSE').then(ensureInstrumentArray).catch(() => []),
      kc.getInstruments('NFO').then(ensureInstrumentArray).catch(() => []),
      kc.getInstruments('BSE').then(ensureInstrumentArray).catch(() => []),
      kc.getInstruments('MCX').then(ensureInstrumentArray).catch(() => []),
      (typeof kc.getMFInstruments === 'function' ? kc.getMFInstruments() : Promise.resolve([]))
        .then((d) => {
          const arr = ensureInstrumentArray(d);
          return arr.map((item) => ({
            exchange: 'MF',
            tradingsymbol: item.tradingsymbol || item.fund_id || item.isin || '',
            name: item.name || item.tradingsymbol || '',
            instrument_type: 'MF',
            segment: 'MF',
            instrument_token: item.instrument_token,
          }));
        })
        .catch(() => []),
    ]);
    const list = [].concat(nse, nfo, bse, mcx, mf);
    if (list.length > 0) {
      instrumentsCache = list;
      instrumentsCacheTime = Date.now();
      const nseEq = nse.filter((i) => (i.instrument_type || '') === 'EQ').length;
      const nseIdx = nse.filter((i) => (i.instrument_type || '') === 'INDEX').length;
      console.log('[instruments] Loaded', list.length, 'from Kite. NSE:', nse.length, '(EQ:', nseEq, 'INDEX:', nseIdx, ') BSE:', bse.length, 'NFO:', nfo.length, 'MCX:', mcx.length, 'MF:', mf.length);
      return list;
    }
  } catch (e) {
    console.warn('[instruments] Kite load failed:', e?.message || e);
  }
  return instrumentsCache.length > 0 ? instrumentsCache : FALLBACK_INSTRUMENTS;
}

// Build search words: "nifty future" -> ["NIFTY", "FUTURE"]; map "FUTURE" -> also match "FUT", "OPTION" -> "CE","PE"
function searchWords(query) {
  const raw = (query || '').toUpperCase().replace(/\s+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const expanded = [];
  for (const w of raw) {
    expanded.push(w);
    if (w === 'FUTURE' || w === 'FUTURES') expanded.push('FUT');
    if (w === 'OPTION' || w === 'OPTIONS') { expanded.push('CE'); expanded.push('PE'); }
  }
  return [...new Set(expanded)];
}

// Score for sorting: exact symbol > symbol starts with > all words in symbol/name > partial
function scoreInstrument(inst, words, fullQuery) {
  const sym = (inst.tradingsymbol || '').toUpperCase();
  const name = (inst.name || '').toUpperCase();
  const combined = `${sym} ${name}`;
  const type = (inst.instrument_type || '').toUpperCase();
  if (sym === fullQuery) return 1000;
  if (sym.startsWith(fullQuery.replace(/\s+/g, ''))) return 800;
  if (combined.includes(fullQuery.replace(/\s+/g, ''))) return 600;
  const allMatch = words.every((w) => combined.includes(w) || sym.includes(w));
  if (allMatch) {
    if (type === 'FUT' && (fullQuery.includes('FUT') || fullQuery.includes('FUTURE'))) return 500;
    if ((type === 'CE' || type === 'PE') && (fullQuery.includes('OPT') || fullQuery.includes('OPTION'))) return 480;
    return 400;
  }
  const partial = words.some((w) => combined.includes(w));
  return partial ? 200 : 0;
}

// GET /api/market/instruments/search?q=rel&limit=500
// Zerodha-like: return all matches from instrument database (cap 2000 for safety)
router.get('/instruments/search', async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 500, 2000);
    if (!q || q.length < 1) {
      return res.json({ suggestions: [] });
    }
    const list = await loadInstruments();
    const fullQuery = q.replace(/\s+/g, ' ').trim().toUpperCase();
    const searchTerm = fullQuery.replace(/\s+/g, '');
    const words = searchWords(q);
    const filtered = list.filter((inst) => {
      const sym = (inst.tradingsymbol || '').toUpperCase();
      const name = (inst.name || '').toUpperCase();
      if (sym.includes(searchTerm) || name.includes(searchTerm)) return true;
      if (words.length > 1) {
        const combined = `${sym} ${name}`;
        return words.every((w) => combined.includes(w) || sym.includes(w));
      }
      return sym.includes(words[0]) || name.includes(words[0]);
    });
    filtered.sort((a, b) => scoreInstrument(b, words, fullQuery) - scoreInstrument(a, words, fullQuery));
    const segmentLabel = (inst) => {
      const ex = (inst.exchange || '').toUpperCase();
      const type = (inst.instrument_type || '').toUpperCase();
      if (type === 'INDEX') return 'Index';
      if (ex === 'NSE' && (type === 'EQ' || !type)) return 'NSE Equity';
      if (ex === 'BSE' && (type === 'EQ' || !type)) return 'BSE Equity';
      if (ex === 'NFO') return type === 'FUT' ? 'NFO Futures' : type === 'CE' || type === 'PE' ? 'NFO Options' : 'NFO';
      if (ex === 'MCX') return 'MCX Commodity';
      if (ex === 'MF') return 'Mutual Fund';
      return ex || 'Market';
    };
    const slice = filtered.slice(0, limit).map((inst) => ({
      exchange: inst.exchange,
      tradingsymbol: inst.tradingsymbol,
      name: inst.name || inst.tradingsymbol,
      instrument_type: inst.instrument_type || 'EQ',
      segment: inst.segment,
      instrument_token: inst.instrument_token,
      key: `${inst.exchange}:${inst.tradingsymbol}`,
      segment_label: segmentLabel(inst),
    }));
    res.json({ suggestions: slice });
  } catch (err) {
    console.error('Error searching instruments', err?.message || err);
    res.status(500).json({ error: err?.message || 'Search failed' });
  }
});

// GET /api/market/quotes?symbols=NIFTY 50,SENSEX,RELIANCE,TCS,...
// Returns real-time LTP and day change for indices and stocks (from Kite).
router.get('/quotes', async (req, res) => {
  try {
    if (!apiKey || !accessToken) {
      return res.status(503).json({
        error: 'Market data unavailable',
        message: 'Set KITE_API_KEY and KITE_ACCESS_TOKEN in backend .env for real-time quotes.',
      });
    }
    const raw = req.query.symbols;
    const symbols = raw
      ? raw.split(',').map((s) => s.trim()).filter(Boolean)
      : ['NIFTY 50', 'SENSEX'];
    const keys = [];
    const keyToName = {};
    for (const sym of symbols) {
      const key = sym.includes(':') ? sym : toKiteInstrumentKey(sym);
      if (key && !keyToName[key]) {
        keys.push(key);
        const upper = (sym.includes(':') ? sym.split(':')[1] : sym).toUpperCase();
        let name = sym.includes(':') ? sym.split(':')[1] : sym;
        if (upper === 'NIFTY50') name = 'NIFTY 50';
        else if (upper === 'NIFTYBANK') name = 'NIFTY BANK';
        keyToName[key] = name;
      }
    }
    if (keys.length === 0) {
      return res.json({ data: [] });
    }
    const kc = getKite();
    const response = await kc.getQuote(keys);
    const data = [];
    // Kite library returns the inner "data" object directly (not { data: {...} })
    const responseData = response && typeof response === 'object' && !Array.isArray(response) ? response : {};
    const responseKeys = Object.keys(responseData);
    if (responseKeys.length > 0) {
      console.log('[quotes] Kite returned keys:', responseKeys.join(', '));
    }
    for (const [kiteKey, q] of Object.entries(responseData)) {
        const name = keyToName[kiteKey] || normalizeKiteKeyToName(kiteKey);
        const lastPrice = Number(q.last_price);
        if (lastPrice === undefined || lastPrice === null || Number.isNaN(lastPrice)) continue;
        const ohlc = q.ohlc || {};
        const prevClose = Number(ohlc.close);
        let netChange = Number(q.net_change);
        if (!Number.isFinite(netChange) && Number.isFinite(prevClose)) {
          netChange = lastPrice - prevClose;
        }
        const changePercent = prevClose && prevClose !== 0 ? (netChange / prevClose) * 100 : 0;
      data.push({
        name,
        value: lastPrice,
        change: Math.round(netChange * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
      });
    }
    if (data.length > 0) {
      console.log('[quotes] Returned', data.length, 'instruments:', data.map((d) => d.name).join(', '));
    }
    res.json({ data });
  } catch (err) {
    console.error('Error fetching quotes', err?.message || err);
    res.status(500).json({
      error: err?.message || 'Failed to fetch quotes',
      details: err?.data || err?.response || null,
    });
  }
});

// Resolve symbol (e.g. RELIANCE or NSE:RELIANCE) to Kite instrument_token using cache or fallback map
async function getInstrumentToken(symbol) {
  const raw = (symbol || '').toString().trim();
  if (!raw) return null;
  const key = raw.includes(':') ? raw : toKiteInstrumentKey(raw);
  if (!key) return null;
  const fallbackToken = INSTRUMENT_TOKENS[raw.replace(/\s+/g, '').replace(':', '')] || INSTRUMENT_TOKENS[key.split(':')[1]?.replace(/\s+/g, '')];
  const list = await loadInstruments();
  const found = list.find((inst) => `${inst.exchange}:${inst.tradingsymbol}` === key);
  if (found && found.instrument_token != null) return Number(found.instrument_token);
  return fallbackToken || null;
}

// Map range to { from, to, interval } for Kite getHistoricalData
function getRangeParams(range) {
  const now = new Date();
  const to = new Date(now);
  let from;
  let interval;
  const r = (range || '6d').toLowerCase();
  if (r === '1d') {
    from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    interval = '15minute';
  } else if (r === '6d') {
    from = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    interval = '60minute';
  } else if (r === '14d') {
    from = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    interval = 'day';
  } else if (r === '52w' || r === '1y') {
    from = new Date(now.getTime() - 52 * 7 * 24 * 60 * 60 * 1000);
    interval = 'day';
  } else if (r === 'ytd') {
    from = new Date(now.getFullYear(), 0, 1);
    interval = 'day';
  } else if (r === '1m') {
    from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    interval = 'day';
  } else if (r === '3m') {
    from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    interval = 'day';
  } else {
    from = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    interval = '60minute';
  }
  return { from, to, interval };
}

// Map display symbol to NFO underlying prefix for option chain (index options)
function symbolToNfoUnderlying(symbol) {
  const s = (symbol || '').toString().trim().toUpperCase().replace(/\s+/g, '');
  if (s === 'NIFTY50' || s === 'NIFTY 50') return 'NIFTY';
  if (s === 'NIFTYBANK' || s === 'NIFTY BANK') return 'BANKNIFTY';
  if (s === 'FINNIFTY' || s === 'FIN NIFTY') return 'FINNIFTY';
  if (s === 'MIDCPNIFTY' || s === 'MIDCP NIFTY') return 'MIDCPNIFTY';
  if (s === 'SENSEX') return 'SENSEX'; // BSE index, may have NFO options
  return s;
}

// GET /api/market/option-chain?symbol=NIFTY50&expiry=2024-03-28 (expiry optional, YYYY-MM-DD)
router.get('/option-chain', async (req, res) => {
  try {
    const rawSymbol = (req.query.symbol || '').toString().trim();
    const expiryParam = (req.query.expiry || '').toString().trim(); // YYYY-MM-DD optional
    if (!rawSymbol) {
      return res.status(400).json({ error: 'symbol is required (e.g. NIFTY50, NIFTY BANK)' });
    }
    if (!apiKey || !accessToken) {
      return res.status(503).json({
        error: 'Market data unavailable',
        message: 'Set KITE_API_KEY and KITE_ACCESS_TOKEN for option chain.',
      });
    }

    const underlying = symbolToNfoUnderlying(rawSymbol.includes(':') ? rawSymbol.split(':')[1] : rawSymbol);
    const list = await loadInstruments();
    const nfoOptions = list.filter(
      (i) => i.exchange === 'NFO' && (i.instrument_type === 'CE' || i.instrument_type === 'PE')
    );

    // Parse tradingsymbol: NIFTY24MAR23150CE -> { underlying: NIFTY, expiryStr: 24MAR, strike: 23150, type: CE }
    const parseOptionSymbol = (ts) => {
      const m = (ts || '').match(/^(.+?)(\d{2}[A-Z]{3})(\d+)(CE|PE)$/);
      if (!m) return null;
      return { underlying: m[1], expiryStr: m[2], strike: Number(m[3]), type: m[4] };
    };

    const optionsForUnderlying = nfoOptions.filter((i) => {
      const p = parseOptionSymbol(i.tradingsymbol);
      return p && p.underlying === underlying;
    });

    if (optionsForUnderlying.length === 0) {
      return res.json({
        symbol: rawSymbol,
        underlying,
        expiries: [],
        chain: [],
        message: 'No NFO options found for this underlying. Try NIFTY50 or NIFTY BANK.',
      });
    }

    // Build expiry list (unique, sorted) as YYYY-MM-DD strings
    const expirySet = new Set();
    optionsForUnderlying.forEach((i) => {
      const exp = i.expiry;
      if (exp) {
        const d = typeof exp === 'string' ? exp.slice(0, 10) : (exp instanceof Date ? exp.toISOString().slice(0, 10) : '');
        if (d) expirySet.add(d);
      }
    });
    const expiries = [...expirySet].sort();

    // If expiry param given, use it; else use nearest future expiry
    let selectedExpiry = expiryParam;
    if (!selectedExpiry && expiries.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      selectedExpiry = expiries.find((e) => e >= today) || expiries[expiries.length - 1];
    }

    const toExpiryStr = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : (typeof d === 'string' ? d.slice(0, 10) : ''));
    const instrumentsForExpiry = optionsForUnderlying.filter((i) => toExpiryStr(i.expiry) === selectedExpiry);

    const keys = instrumentsForExpiry.map((i) => `${i.exchange}:${i.tradingsymbol}`);
    if (keys.length === 0) {
      return res.json({ symbol: rawSymbol, underlying, expiries, selectedExpiry, chain: [] });
    }

    const kc = getKite();
    const quoteResponse = await kc.getQuote(keys);
    const quoteMap = quoteResponse && typeof quoteResponse === 'object' && !Array.isArray(quoteResponse) ? quoteResponse : {};

    const byStrike = {};
    instrumentsForExpiry.forEach((i) => {
      const strike = Number(i.strike) || 0;
      if (!byStrike[strike]) byStrike[strike] = { strike, call: null, put: null };
      const key = `${i.exchange}:${i.tradingsymbol}`;
      const q = quoteMap[key] || {};
      const ltp = q.last_price != null ? Number(q.last_price) : null;
      const oi = q.oi != null ? Number(q.oi) : null;
      const row = { ltp, oi, tradingsymbol: i.tradingsymbol };
      if (i.instrument_type === 'CE') byStrike[strike].call = row;
      else byStrike[strike].put = row;
    });

    const strikes = Object.keys(byStrike)
      .map(Number)
      .sort((a, b) => a - b);
    const chain = strikes.map((strike) => {
      const r = byStrike[strike];
      return {
        strike,
        call_ltp: r.call?.ltp ?? null,
        call_oi: r.call?.oi ?? null,
        put_ltp: r.put?.ltp ?? null,
        put_oi: r.put?.oi ?? null,
      };
    });

    res.json({
      symbol: rawSymbol,
      underlying,
      expiries,
      selectedExpiry,
      chain,
    });
  } catch (err) {
    console.error('Error fetching option chain', err?.message || err);
    res.status(500).json({
      error: err?.message || 'Failed to fetch option chain',
      details: err?.data || err?.response || null,
    });
  }
});

// GET /api/market/candles?symbol=RELIANCE&range=6d  (range: 1d, 6d, 14d, 52w, ytd, 1m, 3m)
router.get('/candles', async (req, res) => {
  try {
    const { symbol: rawSymbol = 'NIFTY50', range = '6d' } = req.query;
    const symbol = rawSymbol.toString().trim() || 'NIFTY50';

    const token = await getInstrumentToken(symbol);
    if (!token) {
      return res.status(400).json({ error: 'Unsupported symbol. Add to watchlist or use NSE:SYMBOL.' });
    }

    const { from, to, interval } = getRangeParams(range);

    if (!apiKey || !accessToken) {
      return res.status(503).json({
        error: 'Market data unavailable',
        message: 'Set KITE_API_KEY and KITE_ACCESS_TOKEN for historical charts.',
      });
    }

    const kc = getKite();
    const candles = await kc.getHistoricalData(
      token,
      interval,
      from.toISOString(),
      to.toISOString(),
      false,
      false
    );

    const data = (Array.isArray(candles) ? candles : []).map((c) => ({
      time: new Date(c.date).getTime() / 1000,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: c.volume != null ? Number(c.volume) : undefined,
    }));

    res.json({ symbol, interval, range, data });
  } catch (err) {
    console.error('Error fetching candles', err?.message || err);
    res.status(500).json({
      error: err?.message || 'Failed to fetch candles',
      details: err?.data || err?.response || null,
    });
  }
});

// GET /api/market/market-depth?symbol=RELIANCE (or NSE:RELIANCE)
// Returns order book (bid/ask depth) from Kite getQuote. Depth has 5 levels each for buy and sell.
router.get('/market-depth', async (req, res) => {
  try {
    const raw = (req.query.symbol || '').toString().trim();
    if (!raw) {
      return res.status(400).json({ error: 'symbol is required (e.g. RELIANCE or NSE:RELIANCE)' });
    }
    if (!apiKey || !accessToken) {
      return res.status(503).json({
        error: 'Market data unavailable',
        message: 'Set KITE_API_KEY and KITE_ACCESS_TOKEN in backend .env for live market depth.',
      });
    }
    const key = raw.includes(':') ? raw : toKiteInstrumentKey(raw);
    if (!key) {
      return res.status(400).json({ error: 'Could not resolve instrument key' });
    }
    const kc = getKite();
    const response = await kc.getQuote([key]);
    const quote = response && response[key];
    if (!quote) {
      return res.json({
        symbol: raw,
        buy: [],
        sell: [],
        ohlc: null,
        last_price: null,
        message: 'No quote data. Try during market hours or check symbol.',
      });
    }
    const buyRaw = (quote.depth && quote.depth.buy) || [];
    const sellRaw = (quote.depth && quote.depth.sell) || [];
    const buy = buyRaw.slice(0, 5).map((b) => ({ price: Number(b?.price) || 0, quantity: Number(b?.quantity) || 0, orders: Number(b?.orders) || 0 }));
    const sell = sellRaw.slice(0, 5).map((s) => ({ price: Number(s?.price) || 0, quantity: Number(s?.quantity) || 0, orders: Number(s?.orders) || 0 }));
    const ohlc = quote.ohlc ? {
      open: Number(quote.ohlc.open) || 0,
      high: Number(quote.ohlc.high) || 0,
      low: Number(quote.ohlc.low) || 0,
      close: Number(quote.ohlc.close) || 0, // prev close
    } : null;
    const lastPrice = Number(quote.last_price) || (ohlc && ohlc.close) || null;
    res.json({
      symbol: raw,
      buy,
      sell,
      ohlc,
      last_price: lastPrice,
    });
  } catch (err) {
    console.error('Error fetching market depth', err?.message || err);
    res.status(500).json({
      error: err?.message || 'Failed to fetch market depth',
    });
  }
});

export default router;
