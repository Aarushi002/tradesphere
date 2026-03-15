# TradeSphere Trading Service

Python backend that receives **TradingView webhook alerts**, routes orders by segment (F&O stocks, index options, long-term), and exposes a REST + WebSocket API for the dashboard. Supports **paper** and **live** modes with a broker-agnostic connector interface.

## Quick start

### 1. Install

```bash
cd trading-service
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Environment

Create a `.env` in `trading-service/` (optional; defaults work for local):

| Variable | Description | Default |
|----------|-------------|---------|
| `TRADING_MODE` | `paper` or `live` | `paper` |
| `TRADING_CONNECTOR` | `paper` or `zerodha` (future) | `paper` |
| `WEBHOOK_SECRET` | Optional secret to validate webhooks | (empty) |
| `TRADING_DB_PATH` | SQLite DB path | `./data/trading.db` |
| `CORS_ORIGINS` | Comma-separated origins for dashboard | `http://localhost:3000,http://127.0.0.1:3000` |
| `DEFAULT_MA_FAST` | Default MA fast period | `9` |
| `DEFAULT_MA_SLOW` | Default MA slow period | `21` |
| `DEFAULT_RSI_PERIOD` | Default RSI period | `14` |
| `DEFAULT_RSI_OVERBOUGHT` | RSI overbought level | `70` |
| `DEFAULT_RSI_OVERSOLD` | RSI oversold level | `30` |

### 3. Run

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- **Webhook**: `POST http://localhost:8000/webhook` (send TradingView alert JSON here).
- **Dashboard API**: `GET /api/status`, `/api/positions`, `/api/orders`, `/api/closed`, `/api/alerts` (optional `?segment=`).
- **WebSocket**: `ws://localhost:8000/ws` for live updates (new orders/positions push to connected clients).

---

## TradingView alert → order flow

1. TradingView fires an alert and POSTs JSON to your webhook URL.
2. **Parse**: `parse_webhook_body()` accepts raw JSON or form `payload=...`.
3. **Segment**: Inferred from payload `segment`/`type` or symbol (e.g. NIFTY/BANKNIFTY/SENSEX → index options). See `app/segments.py`.
4. **Indicators**: MA and RSI parameters are read from the payload and used for position sizing. See below.
5. **Order**: `OrderRequest` is built and sent to the active connector (paper or live). Target: **under 1 s** from alert to order/simulation.

---

## Extending indicator parameters

Indicator logic lives in **`app/strategies/indicators.py`**.

- **MA**: Payload keys `ma_fast`, `ma_slow` (or `ma_fast_period`/`ma_slow_period`). Used in position sizing; you can extend `position_size_from_indicators()` to use MA crossover strength.
- **RSI**: Payload keys `rsi_period`, `rsi_overbought`, `rsi_oversold`. Same function controls how RSI affects quantity.

**In TradingView**, include these in the alert message (e.g. via `{{plot_0}}` or a custom JSON block) so the webhook sends them. Example JSON body:

```json
{
  "symbol": "NIFTY",
  "action": "buy",
  "quantity": 1,
  "segment": "index_options",
  "ma_fast": 9,
  "ma_slow": 21,
  "rsi_period": 14,
  "rsi_overbought": 70,
  "rsi_oversold": 30
}
```

When you change MA/RSI periods or levels in TradingView, send the updated values in the alert; the Python side will use them for that order. Defaults come from `.env` or `config.py` when a key is missing.

---

## Adding a live broker connector

1. Implement **`app/connectors/base.py`** interface in a new file, e.g. `app/connectors/zerodha.py`:

   - `place_order(req: OrderRequest) -> OrderResult`
   - `get_positions(segment: Optional[str]) -> list[Position]`
   - `is_live() -> True`

2. In **`app/order_manager.py`**, inside `get_connector_async()`, add:

   ```python
   if settings.TRADING_CONNECTOR == "zerodha":
       from .connectors.zerodha import ZerodhaConnector
       _connector_instance = ZerodhaConnector(store)  # pass store if needed
       return _connector_instance
   ```

3. Set `TRADING_CONNECTOR=zerodha` and `TRADING_MODE=live` in `.env`, then restart. Strategy and webhook code stay unchanged.

---

## Dashboard

The React app has an **Auto Trading** tab that:

- Shows **Paper** / **Live** status and connector name (from `/api/status`).
- Lists **positions**, **orders**, **closed trades**, and **alerts** with optional segment filter.
- Refreshes automatically via WebSocket; no manual reload needed.
- Exports **CSV** (current tab) and **JSON** (full snapshot).

Set `REACT_APP_TRADING_SERVICE_URL=http://localhost:8000` in the frontend `.env` (or your deployed URL).

---

## Handover checklist

- [ ] Run trading service: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
- [ ] Point TradingView webhook to `https://your-host/webhook` (use ngrok for local testing).
- [ ] Open dashboard → **Auto Trading**; confirm status and data.
- [ ] Tune MA/RSI in `app/strategies/indicators.py` and in TradingView alert message as needed.
- [ ] When going live: implement a connector in `app/connectors/`, set `TRADING_MODE=live` and restart.
