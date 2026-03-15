"""
TradingView webhook: parse JSON, route by segment, apply indicator params, send to order manager.
Target: alert → order within 1 s.
"""
import json
import logging
from typing import Any, Optional

from .config import settings
from .segments import segment_from_alert, Segment
from .strategies.indicators import parse_indicators_from_payload, position_size_from_indicators
from .connectors.base import OrderRequest

logger = logging.getLogger(__name__)


def _defaults() -> dict:
    return {
        "ma_fast": settings.DEFAULT_MA_FAST,
        "ma_slow": settings.DEFAULT_MA_SLOW,
        "rsi_period": settings.DEFAULT_RSI_PERIOD,
        "rsi_overbought": settings.DEFAULT_RSI_OVERBOUGHT,
        "rsi_oversold": settings.DEFAULT_RSI_OVERSOLD,
    }


def parse_webhook_body(body: bytes) -> dict:
    """Parse JSON body; support both raw JSON and form-encoded JSON."""
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        pass
    # Form: payload={"symbol":"NIFTY",...}
    import urllib.parse
    d = urllib.parse.parse_qs(body.decode("utf-8", "replace"))
    if "payload" in d:
        return json.loads(d["payload"][0])
    if "data" in d:
        return json.loads(d["data"][0])
    return {}


def build_order_request(payload: dict) -> Optional[OrderRequest]:
    """
    Map TradingView alert payload to OrderRequest.
    Expected keys: symbol/ticker, action/side (buy/sell), quantity or size;
    optional: segment, order_type, product, exchange, and indicator fields.
    """
    symbol = (payload.get("symbol") or payload.get("ticker") or payload.get("instrument") or "").strip()
    if not symbol:
        logger.warning("Webhook missing symbol/ticker")
        return None

    action = (payload.get("action") or payload.get("side") or payload.get("direction") or "buy").strip().lower()
    side = "buy" if action in ("buy", "long", "bullish", "1") else "sell"

    segment = segment_from_alert(payload)
    indicators = parse_indicators_from_payload(payload, _defaults())
    quantity = int(payload.get("quantity") or payload.get("size") or payload.get("qty") or 1)
    quantity = position_size_from_indicators(segment.value, indicators, default_qty=quantity)

    order_type = (payload.get("order_type") or payload.get("type") or "MARKET").strip().upper()
    price = payload.get("price")
    if price is not None:
        try:
            price = float(price)
        except (TypeError, ValueError):
            price = None
    product = (payload.get("product") or payload.get("product_type") or "MIS").strip().upper()
    if segment == Segment.LONG_TERM:
        product = "CNC"
    exchange = (payload.get("exchange") or "").strip().upper() or None

    return OrderRequest(
        segment=segment.value,
        symbol=symbol,
        side=side,
        quantity=max(1, quantity),
        order_type=order_type,
        price=price,
        product=product,
        exchange=exchange,
    )
