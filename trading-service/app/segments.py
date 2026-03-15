"""
Segment definitions: F&O stocks, index options (Nifty 50, Sensex, Bank Nifty), long-term stocks.
Used to route webhook alerts and apply segment-specific position sizing / rules.
"""
from enum import Enum
from typing import Optional


class Segment(str, Enum):
    FNO_STOCK = "fno_stock"       # F&O stocks
    INDEX_OPTIONS = "index_options"  # Nifty 50, Sensex, Bank Nifty options
    LONG_TERM = "long_term"       # Long-term equity


# Index options underlyings we support
INDEX_OPTION_UNDERLYINGS = {"NIFTY", "NIFTY 50", "NIFTY50", "BANKNIFTY", "NIFTY BANK", "SENSEX"}


def segment_from_alert(payload: dict) -> Segment:
    """
    Determine segment from TradingView webhook payload.
    Expects one of: segment, type, or symbol-based detection.
    """
    seg = (payload.get("segment") or payload.get("type") or "").strip().lower()
    symbol = (payload.get("symbol") or payload.get("ticker") or "").strip().upper()
    if seg in ("fno_stock", "fno", "f&o", "futures", "options_stock"):
        return Segment.FNO_STOCK
    if seg in ("index_options", "index", "nifty", "banknifty", "sensex"):
        return Segment.INDEX_OPTIONS
    if seg in ("long_term", "lt", "equity", "delivery"):
        return Segment.LONG_TERM
    # Infer from symbol
    if any(symbol.startswith(u) or u in symbol for u in INDEX_OPTION_UNDERLYINGS):
        return Segment.INDEX_OPTIONS
    return Segment.FNO_STOCK  # default
