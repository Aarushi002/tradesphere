import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKENS_FILE = path.join(__dirname, '..', '..', '.kite-tokens.json');
const MARKET_TOKEN_FILE = path.join(__dirname, '..', '..', '.kite-token');

// --- Kite API config: from DB (Setting) or env. Populated at startup and when setup/set-redirect-origin is called. ---
let kiteApiKey = null;
let kiteApiSecret = null;
let kiteFrontendUrl = null;

export function getKiteApiKey() {
  return kiteApiKey || process.env.KITE_API_KEY || null;
}

export function getKiteApiSecret() {
  return kiteApiSecret || process.env.KITE_API_SECRET || null;
}

export function getFrontendUrl() {
  return kiteFrontendUrl || process.env.KITE_FRONTEND_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
}

/** Set in-memory config (from DB or setup). Pass undefined to leave unchanged. */
export function setKiteConfig(options = {}) {
  if (options.apiKey !== undefined) kiteApiKey = options.apiKey || null;
  if (options.apiSecret !== undefined) kiteApiSecret = options.apiSecret || null;
  if (options.frontendUrl !== undefined) kiteFrontendUrl = options.frontendUrl || null;
}

// --- Global token for market data (quotes, charts, instruments). Set once by admin; all users get real data. ---
let marketDataToken = null;

function loadMarketDataToken() {
  try {
    if (fs.existsSync(MARKET_TOKEN_FILE)) {
      const t = fs.readFileSync(MARKET_TOKEN_FILE, 'utf8').trim();
      if (t) marketDataToken = t;
    }
  } catch (_) {}
  if (!marketDataToken) marketDataToken = process.env.KITE_ACCESS_TOKEN || null;
  return marketDataToken;
}

loadMarketDataToken();

/** Used by market routes only. All users see the same real-time data; no per-user linking needed. */
export function getMarketDataToken() {
  if (marketDataToken) return marketDataToken;
  return loadMarketDataToken();
}

/** Set by /api/kite/callback when state=market (one-time setup for paper trading app). */
export function setMarketDataToken(token) {
  const t = (token || '').toString().trim();
  if (!t) return;
  marketDataToken = t;
  try {
    fs.writeFileSync(MARKET_TOKEN_FILE, t, 'utf8');
  } catch (err) {
    console.error('[kite-token] Failed to write .kite-token', err?.message);
  }
}

// --- Per-user tokens (optional; for real broker features: positions, orders, MF). Paper trading uses app DB. ---
let tokensByUser = {};
const listeners = [];

function loadFromFile() {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      const raw = fs.readFileSync(TOKENS_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') tokensByUser = { ...data };
    }
  } catch (_) {}
  return tokensByUser;
}

function saveToFile() {
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokensByUser), 'utf8');
  } catch (err) {
    console.error('[kite-token] Failed to write .kite-tokens.json', err?.message);
  }
}

loadFromFile();

export function getAccessToken(userId) {
  if (!userId) return null;
  const token = tokensByUser[String(userId)];
  return (token && typeof token === 'string' && token.trim()) ? token.trim() : null;
}

export function setAccessToken(userId, token) {
  const id = userId ? String(userId) : null;
  const t = (token || '').toString().trim();
  if (!id) return;
  if (!t) delete tokensByUser[id];
  else tokensByUser[id] = t;
  saveToFile();
  listeners.forEach((cb) => { try { cb(id); } catch (_) {} });
}

export function onTokenUpdate(callback) {
  if (typeof callback === 'function') listeners.push(callback);
}

export function clearToken(userId) {
  if (userId) delete tokensByUser[String(userId)];
  else tokensByUser = {};
  saveToFile();
  listeners.forEach((cb) => { try { cb(userId); } catch (_) {} });
}
