"""
FastAPI app: webhook endpoint, REST API for dashboard, WebSocket for live updates.
Alert → order < 1 s; dashboard refreshes without reload.
"""
import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .webhook import parse_webhook_body, build_order_request
from .order_manager import place_order, get_positions, get_store, get_connector_async
from .models import get_connection, init_db
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# WebSocket subscribers for live dashboard updates
ws_subscribers: list[WebSocket] = []


async def broadcast(data: dict):
    """Push to all connected dashboard clients."""
    dead = []
    for ws in ws_subscribers:
        try:
            await ws.send_json(data)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in ws_subscribers:
            ws_subscribers.remove(ws)


@asynccontextmanager
async def lifespan(app: FastAPI):
    conn = await get_connection()
    await init_db(conn)
    conn.close()
    yield
    # Shutdown: clear connector etc. if needed
    pass


app = FastAPI(title="TradeSphere Trading Service", version="1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/webhook")
async def tradingview_webhook(request: Request):
    """
    TradingView alert webhook. POST JSON (or form payload=...).
    Routes by segment (fno_stock, index_options, long_term), applies MA/RSI params, places order.
    Target: < 1 s to place/simulate order.
    """
    body = await request.body()
    if settings.WEBHOOK_SECRET:
        # Optional: validate X-Webhook-Secret or similar
        pass
    payload = parse_webhook_body(body)
    if not payload:
        return {"ok": False, "error": "Invalid JSON"}
    order_req = build_order_request(payload)
    if not order_req:
        return {"ok": False, "error": "Could not build order from payload"}
    segment = order_req.segment
    store = await get_store()
    await store.append_alert(json.dumps(payload), segment, status="processing")
    try:
        result = await place_order(order_req)
        await store.append_alert(json.dumps(payload), segment, order_id=result.order_id, status="placed" if result.status == "placed" else "failed")
        await broadcast({"type": "order", "order_id": result.order_id, "segment": segment, "status": result.status})
        return {"ok": result.status == "placed", "order_id": result.order_id, "status": result.status, "message": result.message}
    except Exception as e:
        logger.exception("Order failed")
        await store.append_alert(json.dumps(payload), segment, status="error")
        return {"ok": False, "error": str(e)}


@app.get("/api/status")
async def api_status():
    """Trading mode and connector status."""
    try:
        conn = await get_connector_async()
        return {
            "mode": settings.TRADING_MODE,
            "connector": settings.TRADING_CONNECTOR,
            "live": conn.is_live(),
        }
    except Exception as e:
        return {"mode": settings.TRADING_MODE, "connector": settings.TRADING_CONNECTOR, "live": False, "error": str(e)}


class ModeBody(BaseModel):
    mode: str  # "paper" | "live"


@app.post("/api/mode")
async def set_mode(body: ModeBody):
    """Toggle paper/live (body: {"mode": "paper"|"live"}). Persist in env or DB in production."""
    if body.mode not in ("paper", "live"):
        return {"ok": False, "error": "mode must be paper or live"}
    return {"ok": True, "message": f"Current mode is {settings.TRADING_MODE}. Set TRADING_MODE env and restart to change.", "current_mode": settings.TRADING_MODE}


@app.get("/api/positions")
async def api_positions(segment: Optional[str] = Query(None)):
    """Live positions, optionally filtered by segment."""
    positions = await get_positions(segment)
    return {"positions": [p.model_dump() for p in positions]}


@app.get("/api/orders")
async def api_orders(segment: Optional[str] = Query(None), limit: int = Query(200, le=500)):
    store = await get_store()
    rows = await store.get_orders(segment, limit=limit)
    return {"orders": [{"order_id": r[0], "segment": r[1], "symbol": r[2], "side": r[3], "quantity": r[4], "order_type": r[5], "price": r[6], "product": r[7], "status": r[8], "created_at": r[9]} for r in rows]}


@app.get("/api/closed")
async def api_closed(segment: Optional[str] = Query(None), limit: int = Query(500, le=1000)):
    store = await get_store()
    rows = await store.get_closed_trades(segment, limit=limit)
    return {"trades": [{"segment": r[0], "symbol": r[1], "side": r[2], "quantity": r[3], "entry_price": r[4], "exit_price": r[5], "pnl": r[6], "closed_at": r[7], "order_id": r[8]} for r in rows]}


@app.get("/api/alerts")
async def api_alerts(segment: Optional[str] = Query(None), limit: int = Query(200, le=500)):
    store = await get_store()
    rows = await store.get_alerts(segment, limit=limit)
    return {"alerts": [{"id": r[0], "received_at": r[1], "payload": r[2], "segment": r[3], "order_id": r[4], "status": r[5]} for r in rows]}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Live updates for dashboard: new orders, position changes."""
    await websocket.accept()
    ws_subscribers.append(websocket)
    try:
        # Send current mode on connect
        conn = await get_connector_async()
        await websocket.send_json({"type": "status", "mode": settings.TRADING_MODE, "live": conn.is_live()})
        while True:
            data = await websocket.receive_text()
            # Optional: client can send {"type":"ping"} and we pong
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in ws_subscribers:
            ws_subscribers.remove(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
