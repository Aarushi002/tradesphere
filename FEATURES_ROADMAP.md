# TradeSphere – Features & Roadmap

## Implemented

- **Watchlist groups:** Create multiple watchlists ("+ New group"), switch via dropdown, all persisted in browser.
- **Paper trading:** Toggle "Paper" vs "Live (Kite)". In Paper mode, balance, orders, and collateral are simulated on TradeSphere; no Zerodha/CDSL links. Orders go to the app’s backend (`/api/trades/buy`, `/api/trades/sell`) and portfolio from `/api/portfolio`.
- **Live (Kite):** When "Live" is selected, orders go to Zerodha Kite; pledging links to CDSL Easiest / Zerodha Console for real collateral.
- **Multi-timeframe charts:** 1D, 6D, 14D, 1M, 3M, 52W, YTD with real data from Kite when configured.
- **Instrument search:** Stocks, futures, options, MF (Zerodha-style), multi-word search.
- **Order panel:** Buy/Sell, Market/Limit, Product (CNC/MIS/NRML), F&O rules; Paper uses in-app APIs, Live uses Kite.

---

## Roadmap (your requested features)

### Advanced charting

- **Goal:** Highly customizable charts (candles, lines, Renko), 100k+ public indicators, 400+ built-in indicators, 110+ drawing tools.
- **Options:** Integrate **TradingView** (widget or library) for professional charting, or use a library like **Lightweight Charts** with plugins for more indicators and drawing tools. Renko and extra studies require either TradingView or a custom/plugin implementation.

### Asset coverage

- **Goal:** Stocks, ETFs, cryptocurrencies, Forex, commodities, indices.
- **Current:** NSE/BSE equities, NFO (futures/options), indices, MF via Kite. No crypto/Forex/commodities in Kite.
- **Options:** Add data providers (e.g. crypto APIs, Forex feeds) and map them into the same search/watchlist/chart flow.

### Multi-timeframe analysis

- **Goal:** View different time frames (e.g. 1-day, 30-min) simultaneously.
- **Current:** Single chart with a timeframe selector (1D–YTD).
- **Next:** Add a second chart or split view with an independent timeframe (e.g. one 1D, one 30m) for the same or different symbols.

### Pine Script

- **Goal:** Custom indicators and strategies.
- **Note:** Pine Script is TradingView’s language. To support it, embed **TradingView** or use a compatible charting stack. A custom Pine-like language would require a full scripting engine and chart integration.

### Social networking

- **Goal:** Share ideas, follow traders, discuss market trends.
- **Current:** Basic feed/comment structure exists.
- **Next:** Expand into follows, likes, dedicated “ideas” posts, and notifications.

### Cloud-based & integrated

- **Goal:** Alerts, charts, and analysis sync across devices; trade on the platform with supported brokers.
- **Current:** Web app (cloud-hosted); Kite is the supported broker for live orders; paper trading is fully in-app.
- **Next:** Persist alerts and chart layouts in the backend; optional mobile app or PWA; more brokers via their APIs where available.

---

## Summary

- **New group** and **Paper vs Live** (orders and pledging in-app for Paper) are implemented.
- **Advanced charting, Pine, multi-asset, social, and cloud sync** are on the roadmap; the largest leap is charting (TradingView integration or equivalent) and asset coverage (new data sources).
