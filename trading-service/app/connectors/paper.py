"""
Paper connector: simulates orders in DB; no real broker calls.
"""
import uuid
from typing import Optional, Any
from ..connectors.base import OrderConnector, OrderRequest, OrderResult, Position


class PaperConnector(OrderConnector):
    def __init__(self, store: Any):
        self._store = store

    async def place_order(self, req: OrderRequest) -> OrderResult:
        order_id = f"PAPER-{uuid.uuid4().hex[:12].upper()}"
        await self._store.append_order(
            order_id=order_id,
            segment=req.segment,
            symbol=req.symbol,
            side=req.side,
            quantity=req.quantity,
            order_type=req.order_type,
            price=req.price,
            product=req.product,
            status="placed",
        )
        # Update position for paper: simple add to position
        price = req.price or 0.0
        await self._store.upsert_position(req.segment, req.symbol, req.side, req.quantity, price, order_id)
        return OrderResult(order_id=order_id, status="placed", message="Paper order placed")

    async def get_positions(self, segment: Optional[str] = None) -> list[Position]:
        return await self._store.get_positions(segment)

    def is_live(self) -> bool:
        return False
