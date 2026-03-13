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

For live candles and real-time prices you need Zerodha Kite API:

1. Add to `.env`:
   ```env
   KITE_API_KEY=your_kite_api_key
   KITE_ACCESS_TOKEN=your_access_token
   ```
2. Get an access token using the script (after logging in via Kite):
   ```bash
   node scripts/getKiteAccessToken.js
   ```
3. Backend will use these for `/api/market/candles`. Only symbols configured in `routes/market.js` (e.g. NIFTY50, RELIANCE) will return live data.

**Note:** This app is for **paper/simulated trading**. Real brokerage like Zerodha requires their API terms, KYC, and compliance. TradeSphere does not execute real orders on exchanges.
