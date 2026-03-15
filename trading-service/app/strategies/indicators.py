"""
Indicator parameters from TradingView (MA, RSI).
Changes in TradingView alert message are reflected in position sizing and logic here.
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class MAParams:
    fast: int
    slow: int
    # Optional: source (close/open), type (sma/ema)
    source: str = "close"
    type: str = "sma"


@dataclass
class RSIParams:
    period: int
    overbought: float
    oversold: float
    source: str = "close"


@dataclass
class IndicatorParams:
    """Parsed from webhook payload; used for position sizing and entry/exit."""
    ma: Optional[MAParams] = None
    rsi: Optional[RSIParams] = None
    # Optional: trend from alert
    trend: Optional[str] = None  # "bullish" | "bearish" | None
    strength: Optional[float] = None  # 0–1 if provided


def parse_indicators_from_payload(payload: dict, defaults: dict) -> IndicatorParams:
    """
    Extract MA and RSI parameters from TradingView webhook JSON.
    TradingView alert message can include {{plot_0}}, {{plot_1}}, etc. or custom JSON.
    """
    ma = None
    if "ma_fast" in payload or "ma_fast_period" in payload:
        ma = MAParams(
            fast=int(payload.get("ma_fast") or payload.get("ma_fast_period") or defaults.get("ma_fast", 9)),
            slow=int(payload.get("ma_slow") or payload.get("ma_slow_period") or defaults.get("ma_slow", 21)),
        )
    if "ma_period" in payload and ma is None:
        p = int(payload.get("ma_period", defaults.get("ma_fast", 9)))
        ma = MAParams(fast=p, slow=int(payload.get("ma_slow_period", p * 2)))

    rsi = None
    if "rsi" in payload or "rsi_period" in payload:
        rsi = RSIParams(
            period=int(payload.get("rsi_period") or payload.get("rsi") or defaults.get("rsi_period", 14)),
            overbought=float(payload.get("rsi_overbought") or defaults.get("rsi_overbought", 70)),
            oversold=float(payload.get("rsi_oversold") or defaults.get("rsi_oversold", 30)),
        )

    trend = (payload.get("trend") or payload.get("direction") or "").strip().lower()
    if trend not in ("bullish", "bearish", ""):
        trend = None
    strength = payload.get("strength")
    if strength is not None:
        try:
            strength = float(strength)
        except (TypeError, ValueError):
            strength = None

    return IndicatorParams(ma=ma, rsi=rsi, trend=trend or None, strength=strength)


def position_size_from_indicators(
    segment: str,
    indicators: IndicatorParams,
    default_qty: int = 1,
    max_fno_qty: int = 100,
    max_index_lots: int = 50,
) -> int:
    """
    Compute order quantity from indicator params and segment.
    Extend this with your own rules (e.g. RSI extreme = smaller size).
    """
    qty = default_qty
    if indicators.strength is not None and 0 <= indicators.strength <= 1:
        # Scale by signal strength if provided
        qty = max(1, int(default_qty * (0.5 + indicators.strength * 0.5)))
    if segment == "fno_stock":
        return min(max(1, qty), max_fno_qty)
    if segment == "index_options":
        return min(max(1, qty), max_index_lots)
    if segment == "long_term":
        return max(1, qty)
    return max(1, qty)
