import './loadEnv.js';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

const app = express();
const corsOrigins = (process.env.FRONTEND_URL || process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors(corsOrigins.length ? { origin: corsOrigins } : {}));
app.use(express.json());
app.use(morgan('dev'));

// Minimal routes first — no DB or heavy imports so the server always starts and Render marks it "live"
app.get('/', (req, res) => {
  res.status(200).send('OK');
});
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'tradesphere-backend' });
});
app.get('/api/test', (req, res) => {
  res.send('API is working');
});

const PORT = process.env.PORT || 5000;

// Start listening immediately so Render never gets stuck on "Application loading"
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Load MongoDB and all other routes after listen (so a failing import/connect doesn't prevent the server from starting)
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/tradesphere';

async function loadRest() {
  const mongoose = (await import('mongoose')).default;
  const authRoutes = (await import('../routes/auth.js')).default;
  const tradesRoutes = (await import('../routes/trades.js')).default;
  const portfolioRoutes = (await import('../routes/portfolio.js')).default;
  const stocksRoutes = (await import('../routes/stocks.js')).default;
  const leaderboardRoutes = (await import('../routes/leaderboard.js')).default;
  const socialRoutes = (await import('../routes/social.js')).default;
  const marketRoutes = (await import('../routes/market.js')).default;
  const { default: kiteRoutes, handleKiteCallback } = await import('../routes/kite.js');

  app.get('/api/kite/callback', handleKiteCallback);
  app.use('/api/auth', authRoutes);
  app.use('/api/trades', tradesRoutes);
  app.use('/api/portfolio', portfolioRoutes);
  app.use('/api/stocks', stocksRoutes);
  app.use('/api/leaderboard', leaderboardRoutes);
  app.use('/api/social', socialRoutes);
  app.use('/api/market', marketRoutes);
  app.use('/api/kite', kiteRoutes);
  app.use((req, res) => res.status(404).send('Not Found'));

  try {
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB connected');
    const Setting = (await import('../models/Setting.js')).default;
    const { setMarketDataToken, setKiteConfig } = await import('./lib/kiteToken.js');
    const docs = await Setting.find({ key: { $in: ['kite_api_key', 'kite_api_secret', 'frontend_url', 'kite_market_token'] } });
    const byKey = {};
    docs.forEach((d) => { if (d && d.key) byKey[d.key] = d.value; });
    if (byKey.kite_api_key) setKiteConfig({ apiKey: byKey.kite_api_key });
    if (byKey.kite_api_secret) setKiteConfig({ apiSecret: byKey.kite_api_secret });
    if (byKey.frontend_url) setKiteConfig({ frontendUrl: byKey.frontend_url });
    if (byKey.kite_market_token) {
      setMarketDataToken(byKey.kite_market_token);
      console.log('[kite] Restored market data token from DB');
    }
    if (byKey.kite_api_key) console.log('[kite] Loaded API config from DB');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
  }

  const { startRealtime } = await import('./lib/realtimeData.js');
  if (typeof startRealtime === 'function') startRealtime();
}

loadRest().catch((err) => {
  console.error('Failed to load routes/DB:', err);
});

