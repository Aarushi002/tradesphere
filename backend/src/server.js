import './loadEnv.js';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import authRoutes from '../routes/auth.js';
import tradesRoutes from '../routes/trades.js';
import portfolioRoutes from '../routes/portfolio.js';
import stocksRoutes from '../routes/stocks.js';
import leaderboardRoutes from '../routes/leaderboard.js';
import socialRoutes from '../routes/social.js';
import marketRoutes from '../routes/market.js';
import kiteRoutes from '../routes/kite.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'tradesphere-backend' });
});

app.use('/api/auth', authRoutes);
app.use('/api/trades', tradesRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/stocks', stocksRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/kite', kiteRoutes);

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/tradesphere';

async function start() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB connected');

    // Restore Kite config and market token from DB so no env vars needed (fully automated setup)
    try {
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
    } catch (e) {
      // ignore if Setting model or token missing
    }

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
}

start();

