# TradeSphere Backend

Backend for paper trading (simulated buy/sell), portfolio, and optional live data via Zerodha Kite.

## Run locally (required for Buy/Sell & portfolio)

1. **Install MongoDB**  
   - [Download MongoDB Community](https://www.mongodb.com/try/download/community) and run it, or use Docker: `docker run -d -p 27017:27017 mongo`

2. **Install dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Environment**
   - Create a `.env` file in `backend/` (optional; defaults work for local run):
   ```env
   MONGO_URI=mongodb://localhost:27017/tradesphere
   JWT_SECRET=your-secret-key
   ```

4. **Start the server**
   ```bash
   npm start
   ```
   You should see: `MongoDB connected` and `Server running on port 5000`.

5. **Frontend**  
   Run the frontend from the project root: `cd frontend && npm start`. It will call `http://localhost:5000` for login, portfolio, and buy/sell.

## What works without extra setup

- **Auth**: Register / Login  
- **Paper trading**: Buy and Sell use simulated prices (from `Stock` model, default 100). Cash and holdings are updated in MongoDB.  
- **Portfolio**: Holdings, P&L, Orders list  
- **Chart**: Uses mock per-symbol data when market API is not configured.

## Zerodha-like live data (optional)

For live candles and real-time prices you need Zerodha Kite API.

### One-time setup

1. Add to `backend/.env` (local) or set the same variables in your **hosting environment** (e.g. Vercel → Project → Settings → Environment Variables):
   ```env
   KITE_API_KEY=your_kite_api_key
   KITE_API_SECRET=your_kite_api_secret
   KITE_ACCESS_TOKEN=your_access_token
   FRONTEND_URL=http://localhost:3000
   ```
   **If you see "Set KITE_API_KEY in backend .env"**: locally, ensure the backend is started from the `backend` folder so `backend/.env` is loaded; in production, add `KITE_API_KEY` and `KITE_API_SECRET` in your host's env vars.
2. In [Kite developer console](https://developers.kite.trade/), set your app’s **Redirect URL** to:
   - **Deployed app (Vercel + Render):** use your Render callback URL, e.g. `https://tradesphere-fall1.onrender.com/api/kite/callback`. If you use localhost here, you'll get `localhost:3000/?kite_refreshed=1` after Kite login.
   - Local only: `http://localhost:5000/api/kite/callback`
   - Kite allows one redirect URL; use the one that matches where your frontend runs.
3. (Optional) Get the first token manually:
   ```bash
   node scripts/get-kite-token.js <request_token>
   ```
   Get `request_token` from the redirect URL after logging in at the Kite connect URL.

### Daily refresh (automated)

Access tokens expire daily. You can refresh without editing `.env`:

1. In the app, when you see **Sample data**, click **Refresh Kite session**.
2. You are redirected to Kite → log in → redirected back to the app.
3. The new token is saved to `backend/.kite-token` and used immediately (no restart).
4. On the next backend restart, the token is read from `.kite-token` if present.

So you only need to click **Refresh Kite session** once per day (e.g. at market open) instead of copying tokens manually.

**Note:** This app is for **paper/simulated trading**. Real brokerage like Zerodha requires their API terms, KYC, and compliance. TradeSphere does not execute real orders on exchanges.

## Live tick-by-tick data (TrueData, paid)

For **real-time** NSE/BSE prices and charts (no daily token refresh), you can use [TrueData](https://www.truedata.in/products/marketdataapi) as an authorised market data provider.

1. **Sign up** at [TrueData Market Data API](https://www.truedata.in/products/marketdataapi) and get trial/paid credentials.
2. **Add to `backend/.env`** (or your host’s env):
   ```env
   TRUEDATA_USER=your_username
   TRUEDATA_PASSWORD=your_password
   TRUEDATA_PORT=8082
   ```
3. **Restart the backend.** It will connect to TrueData’s WebSocket and cache live ticks. Quotes and charts will use this feed when connected; otherwise the app falls back to Yahoo Finance (delayed).

No Zerodha API or token is required when using TrueData. Option chain and market depth still use Zerodha if configured.
