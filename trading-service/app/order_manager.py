"""
Order manager: routes orders to the active connector (paper or live).
Swap connector without changing webhook or strategy code.
"""
import logging
from typing import Optional

from .config import settings
from .connectors.base import OrderConnector, OrderRequest, OrderResult
from .models import OrderStore, get_connection, init_db

logger = logging.getLogger(__name__)

_store: Optional[OrderStore] = None


async def get_store() -> OrderStore:
    global _store
    if _store is None:
        conn = await get_connection()
        await init_db(conn)
        _store = OrderStore(conn)
    return _store


_connector_instance: Optional[OrderConnector] = None


async def get_connector_async() -> OrderConnector:
    """Return connector for current TRADING_CONNECTOR (paper | zerodha | ...)."""
    global _connector_instance
    if _connector_instance is not None:
        return _connector_instance
    store = await get_store()
    if settings.TRADING_CONNECTOR == "zerodha":
        # from .connectors.zerodha import ZerodhaConnector
        # _connector_instance = ZerodhaConnector(store)
        raise NotImplementedError("Zerodha connector not yet implemented; use TRADING_CONNECTOR=paper")
    from .connectors.paper import PaperConnector
    _connector_instance = PaperConnector(store)
    return _connector_instance


async def place_order(req: OrderRequest) -> OrderResult:
    connector = await get_connector_async()
    return await connector.place_order(req)


async def get_positions(segment: Optional[str] = None):
    connector = await get_connector_async()
    return await connector.get_positions(segment)


def is_live_mode() -> bool:
    return settings.TRADING_MODE == "live"
