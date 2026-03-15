/**
 * Live tick-by-tick market data via TrueData (paid).
 * When TRUEDATA_USER and TRUEDATA_PASSWORD are set, connects to TrueData WebSocket
 * and caches LTP for GET /api/market/quotes. Falls back to Yahoo if not configured.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// In-memory cache: displayName -> { name, value, change, changePercent, ts }
const quoteCache = new Map();
let rtFeed = null;
let rtConnectFn = null;
let rtSubscribeFn = null;
let rtUnsubscribeFn = null;
let isSocketConnectedFn = null;
let historicalAuthFn = null;
let historicalGetBarDataFn = null;
let formatTimeFn = null;
let tdInitialized = false;

function loadTrueData() {
  if (tdInitialized) return;
  try {
    const td = require('truedata-nodejs');
    rtConnectFn = td.rtConnect;
    rtSubscribeFn = td.rtSubscribe;
    rtUnsubscribeFn = td.rtUnsubscribe;
    rtFeed = td.rtFeed;
    isSocketConnectedFn = td.isSocketConnected;
    historicalAuthFn = td.historical?.auth;
    historicalGetBarDataFn = td.historical?.getBarData;
    formatTimeFn = td.formatTime;
    tdInitialized = true;
  } catch (e) {
    console.warn('[realtime] truedata-nodejs not installed or load failed:', e?.message);
  }
}

/** Map our display symbol to TrueData symbol (e.g. NIFTY 50 -> NIFTY-I, RELIANCE -> RELIANCE). */
export function toTrueDataSymbol(displaySymbol) {
  const s = (displaySymbol || '').toString().trim();
  if (!s) return null;
  const upper = s.toUpperCase().replace(/\s+/g, '');
  if (upper === 'NIFTY50' || upper === 'NIFTY 50') return 'NIFTY-I';
  if (upper === 'NIFTYBANK' || upper === 'NIFTY BANK') return 'BANKNIFTY-I';
  if (upper === 'SENSEX') return 'SENSEX';
  return s.replace(/\s+/g, ' '); // equity as-is: RELIANCE, TCS
}

/** Map TrueData symbol back to display name. */
export function fromTrueDataSymbol(tdSymbol) {
  const s = (tdSymbol || '').toString().trim();
  if (!s) return null;
  if (s === 'NIFTY-I') return 'NIFTY 50';
  if (s === 'BANKNIFTY-I') return 'NIFTY BANK';
  return s;
}

function updateCache(tdSymbol, ltp, prevCloseOrChange, changePercent) {
  const name = fromTrueDataSymbol(tdSymbol) || tdSymbol;
  const value = Number(ltp);
  if (!Number.isFinite(value)) return;
  let change = prevCloseOrChange != null ? Number(prevCloseOrChange) : null;
  let pct = changePercent != null ? Number(changePercent) : null;
  if (change == null && Number.isFinite(Number(prevCloseOrChange))) change = value - Number(prevCloseOrChange);
  if (pct == null && change != null && Number.isFinite(change) && prevCloseOrChange != null && Number(prevCloseOrChange) !== 0) {
    pct = (change / Number(prevCloseOrChange)) * 100;
  }
  if (pct == null) pct = 0;
  if (change == null) change = 0;
  quoteCache.set(name, {
    name,
    value,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(pct * 100) / 100,
    ts: Date.now(),
  });
}

export function isRealtimeConfigured() {
  const user = process.env.TRUEDATA_USER || process.env.TRUEDATA_USERNAME;
  const pwd = process.env.TRUEDATA_PASSWORD || process.env.TRUEDATA_PWD;
  return Boolean(user && pwd);
}

export function isRealtimeConnected() {
  loadTrueData();
  return isSocketConnectedFn ? isSocketConnectedFn() === true : false;
}

/**
 * Get cached quotes for requested display symbols. Returns only those present in cache.
 * @param {string[]} displaySymbols - e.g. ['NIFTY 50', 'SENSEX', 'RELIANCE']
 * @returns {{ name, value, change, changePercent }[]}
 */
export function getCachedQuotes(displaySymbols) {
  if (!displaySymbols || !displaySymbols.length) return [];
  const out = [];
  for (const sym of displaySymbols) {
    const name = sym.includes(':') ? (sym.split(':')[1] || sym).trim() : sym.trim();
    const n = name.toUpperCase() === 'NIFTY50' ? 'NIFTY 50' : name.toUpperCase() === 'NIFTYBANK' ? 'NIFTY BANK' : name;
    const c = quoteCache.get(n);
    if (c) out.push({ name: c.name, value: c.value, change: c.change, changePercent: c.changePercent });
  }
  return out;
}

/** Default symbols to subscribe for live feed. */
const DEFAULT_SYMBOLS = ['NIFTY-I', 'BANKNIFTY-I', 'SENSEX', 'RELIANCE', 'TCS', 'INFY', 'HDFCBANK'];

/**
 * Start TrueData WebSocket and subscribe to symbols. Call once at startup when env is set.
 */
export function startRealtime() {
  if (!isRealtimeConfigured()) return;
  loadTrueData();
  if (!rtConnectFn || !rtFeed) return;
  const user = process.env.TRUEDATA_USER || process.env.TRUEDATA_USERNAME;
  const pwd = process.env.TRUEDATA_PASSWORD || process.env.TRUEDATA_PWD;
  const port = Number(process.env.TRUEDATA_PORT) || 8082;
  const symbols = DEFAULT_SYMBOLS;
  const bidask = 0;
  const heartbeat = 0;
  const replay = 0;
  const url = 'push';

  const touchlineHandler = (data) => {
    try {
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        for (const [sym, row] of Object.entries(data)) {
          if (!row || sym == null) continue;
          const ltp = row.LTP ?? row.ltp ?? row.last_price;
          const prevClose = row.Previous_Close ?? row.Open ?? row.prev_close;
          if (ltp != null) updateCache(sym, ltp, prevClose, null);
        }
      }
    } catch (e) {
      // ignore
    }
  };
  const tickHandler = (data) => {
    try {
      const sym = data?.Symbol ?? data?.symbol ?? data?.name;
      const ltp = data?.LTP ?? data?.ltp ?? data?.last_price;
      const prevClose = data?.Prev_Close ?? data?.Open ?? data?.Previous_Close;
      if (sym != null && ltp != null) updateCache(sym, ltp, prevClose, null);
    } catch (e) {
      // ignore
    }
  };

  rtFeed?.on?.('touchline', touchlineHandler);
  rtFeed?.on?.('tick', tickHandler);

  try {
    rtConnectFn(user, pwd, symbols, port, bidask, heartbeat, replay, url);
    console.log('[realtime] TrueData WebSocket connecting for', symbols.length, 'symbols');
  } catch (e) {
    console.error('[realtime] TrueData rtConnect failed:', e?.message || e);
  }
}

/** Subscribe to more symbols (e.g. when user adds to watchlist). Symbols in TrueData format. */
export function subscribeSymbols(trueDataSymbols) {
  loadTrueData();
  if (rtSubscribeFn && Array.isArray(trueDataSymbols) && trueDataSymbols.length > 0) {
    try {
      rtSubscribeFn(trueDataSymbols);
    } catch (e) {
      console.warn('[realtime] rtSubscribe failed:', e?.message);
    }
  }
}

/** Authenticate TrueData historical API (for candles). Call once when using getBarData. */
export function authHistorical() {
  if (!isRealtimeConfigured()) return false;
  loadTrueData();
  if (historicalAuthFn) {
    const user = process.env.TRUEDATA_USER || process.env.TRUEDATA_USERNAME;
    const pwd = process.env.TRUEDATA_PASSWORD || process.env.TRUEDATA_PWD;
    try {
      historicalAuthFn(user, pwd);
      return true;
    } catch (e) {
      console.warn('[realtime] historical.auth failed:', e?.message);
      return false;
    }
  }
  return false;
}

/**
 * Fetch historical bar data from TrueData. Returns array of { time, open, high, low, close } in seconds.
 * @param {string} symbol - Display symbol (e.g. RELIANCE, NIFTY 50)
 * @param {string} range - 1d, 6d, 14d, 52w, ytd, 1m, 3m
 */
export async function getHistoricalBars(symbol, range = '6d') {
  loadTrueData();
  if (!historicalGetBarDataFn || !formatTimeFn) return null;
  authHistorical();
  const tdSymbol = toTrueDataSymbol(symbol);
  if (!tdSymbol) return null;
  const now = new Date();
  let from, to, interval, duration;
  const r = (range || '6d').toLowerCase();
  if (r === '1d') {
    from = formatTimeFn(now.getFullYear(), now.getMonth() + 1, now.getDate(), 9, 15);
    to = formatTimeFn(now.getFullYear(), now.getMonth() + 1, now.getDate(), 15, 30);
    interval = '15min';
  } else if (r === '6d') {
    duration = '5D';
    interval = '60min';
  } else if (r === '14d') {
    duration = '2W';
    interval = '1min';
  } else if (r === '52w' || r === '1y') {
    duration = '1Y';
    interval = 'EOD';
  } else if (r === 'ytd') {
    const yStart = new Date(now.getFullYear(), 0, 1);
    from = formatTimeFn(yStart.getFullYear(), yStart.getMonth() + 1, yStart.getDate(), 9, 15);
    to = formatTimeFn(now.getFullYear(), now.getMonth() + 1, now.getDate(), 15, 30);
    interval = 'EOD';
  } else if (r === '1m') {
    duration = '1M';
    interval = 'EOD';
  } else if (r === '3m') {
    duration = '3M';
    interval = 'EOD';
  } else {
    duration = '5D';
    interval = '60min';
  }

  try {
    let res;
    if (duration) {
      res = await historicalGetBarDataFn(tdSymbol, duration, interval, 'json', 0);
    } else {
      res = await historicalGetBarDataFn(tdSymbol, from, to, interval, 'json', 0);
    }
    const bars = res?.Records ?? res?.data ?? (Array.isArray(res) ? res : []);
    return (bars || []).map((b) => {
      const date = b?.date ?? b?.time ?? b?.datetime;
      const t = date instanceof Date ? date.getTime() / 1000 : (typeof date === 'number' ? date / 1000 : 0);
      return {
        time: Math.floor(t),
        open: Number(b?.open ?? 0),
        high: Number(b?.high ?? b?.open ?? 0),
        low: Number(b?.low ?? b?.open ?? 0),
        close: Number(b?.close ?? b?.ltp ?? 0),
      };
    });
  } catch (e) {
    console.warn('[realtime] getBarData failed for', tdSymbol, e?.message);
    return null;
  }
}
