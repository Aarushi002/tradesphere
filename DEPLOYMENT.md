# Going live with Tradesphere

This guide walks you through deploying the frontend and backend so the app works in production.

## Overview

- **Frontend**: React app (build static files). Deploy to **Vercel** or **Netlify**.
- **Backend**: Node.js + Express + MongoDB. Deploy to **Render**, **Railway**, or **Fly.io**.
- **Database**: Use **MongoDB Atlas** (free tier) for production.

---

## 1. MongoDB Atlas (database)

1. Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) and create a free account.
2. Create a **cluster** (free M0).
3. Under **Database Access** → Add user (username + password). Note the password.
4. Under **Network Access** → Add IP: **0.0.0.0/0** (allow from any host; Render/Railway IPs change).
5. In the cluster, click **Connect** → **Connect your application** → copy the connection string. It looks like:
   ```text
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/DATABASE?retryWrites=true&w=majority
   ```
6. Replace `USER`, `PASSWORD`, and optionally `DATABASE` (e.g. `tradesphere`) in that string. This is your **MONGO_URI** for production.

---

## 2. Backend (Render recommended)

1. Push your code to **GitHub** (if not already).
2. Go to [render.com](https://render.com) → **New** → **Web Service**.
3. Connect the repo and set:
   - **Root Directory**: `backend`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance**: Free (or paid for always-on)
4. **Environment** (in Render dashboard):
   | Variable        | Value |
   |-----------------|--------|
   | `NODE_ENV`      | `production` |
   | `PORT`          | `5000` (or leave default) |
   | `MONGO_URI`     | Your Atlas connection string |
   | `JWT_SECRET`    | A long random string (e.g. 32+ chars) |
   | `FRONTEND_URL`  | Your frontend URL, e.g. `https://tradesphere.vercel.app` (no trailing slash) |
5. Add Kite (Zerodha) vars if you use live trading: `KITE_API_KEY`, `KITE_API_SECRET`. Do **not** commit these; set only in Render.
6. Deploy. Note the backend URL, e.g. `https://tradesphere-xxxx.onrender.com`.

---

## 3. Frontend (Vercel recommended)

1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project** → import your repo.
2. Set **Root Directory** to `frontend`.
3. **Environment Variables**:
   | Variable               | Value |
   |------------------------|--------|
   | `REACT_APP_API_URL`    | Your backend URL, e.g. `https://tradesphere-xxxx.onrender.com` (no trailing slash) |
4. Optional: `REACT_APP_TRADING_SERVICE_URL` if you use the separate trading service (e.g. `http://localhost:8000` in dev; set production URL if you deploy it).
5. Deploy. Vercel will build with `npm run build` and serve the app. Note the frontend URL, e.g. `https://tradesphere.vercel.app`.

---

## 4. Wire backend to frontend

1. In **Render** (backend), set **FRONTEND_URL** to your Vercel (or Netlify) URL, e.g. `https://tradesphere.vercel.app`. This enables CORS and Kite redirects.
2. If you use multiple domains (e.g. www and non-www), set **CORS_ORIGIN** to a comma-separated list: `https://tradesphere.vercel.app,https://www.tradesphere.vercel.app`.

---

## 5. Zerodha Kite (optional – live market / orders)

1. In [Zerodha Kite API](https://kite.trade/) set **Redirect URL** to:
   ```text
   https://YOUR-BACKEND-URL/api/kite/callback
   ```
   Example: `https://tradesphere-xxxx.onrender.com/api/kite/callback`
2. In Render, set **KITE_API_KEY** and **KITE_API_SECRET** (from Kite console).
3. In the app, use **Connect Kite** (or equivalent). After login, Kite will redirect to your backend, which then redirects to **FRONTEND_URL** (your Vercel URL). Ensure **FRONTEND_URL** matches the domain you use.

---

## 6. Build and test locally (optional)

- **Backend**:  
  `cd backend`  
  Set `.env` with production-like values (e.g. Atlas MONGO_URI, strong JWT_SECRET, FRONTEND_URL).  
  `npm start`

- **Frontend**:  
  `cd frontend`  
  Create `.env.production` with `REACT_APP_API_URL=https://your-backend.onrender.com`  
  `npm run build`  
  `npx serve -s build` (or use `npm run build` and deploy the `build` folder).

---

## Checklist before go-live

- [ ] MongoDB Atlas cluster is running and MONGO_URI is in backend env.
- [ ] Backend env has `NODE_ENV=production`, `JWT_SECRET`, `FRONTEND_URL` (and `MONGO_URI`).
- [ ] Frontend env has `REACT_APP_API_URL` pointing to the backend URL.
- [ ] Backend CORS: FRONTEND_URL (or CORS_ORIGIN) set so the browser allows API calls from your frontend domain.
- [ ] If using Kite: redirect URL in Kite console = `https://<backend>/api/kite/callback`; KITE_API_KEY and KITE_API_SECRET in backend env only.
- [ ] No secrets in repo: `.env` and `.env.local` are in `.gitignore` (they are by default).

---

## Troubleshooting

- **CORS / "Cannot reach server"**: Ensure backend has **FRONTEND_URL** (or **CORS_ORIGIN**) set to the exact URL you use in the browser (including https).
- **MongoDB connection failed**: Check MONGO_URI; ensure Atlas Network Access allows your backend’s IP (0.0.0.0/0 for Render).
- **Kite redirect goes to wrong site**: Set **FRONTEND_URL** on the backend to the URL where users should land after Kite login (e.g. your Vercel URL).
- **Build fails on Vercel**: Ensure root directory is `frontend` and that `REACT_APP_*` vars are set in Vercel (not only in `.env.production`).
