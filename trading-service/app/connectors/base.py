"""
Broker connector interface. Add new brokers by implementing this interface;
strategy and webhook layers stay unchanged.
"""
from abc import ABC, abstractmethod
from typing import Optional
from pydantic import BaseModel


class OrderRequest(BaseModel):
    segment: str
    symbol: str
    side: str  # "buy" | "sell"
    quantity: int
    order_type: str = "MARKET"
    price: Optional[float] = None
    product: str = "MIS"  # MIS | NRML | CNC etc.
    exchange: Optional[str] = None  # NSE | NFO | BSE etc.


class OrderResult(BaseModel):
    order_id: str
    status: str  # "placed" | "rejected" | "pending"
    message: Optional[str] = None


class Position(BaseModel):
    symbol: str
    segment: str
    side: str
    quantity: int
    avg_price: float
    pnl: Optional[float] = None
    exchange: Optional[str] = None


class OrderConnector(ABC):
    @abstractmethod
    async def place_order(self, req: OrderRequest) -> OrderResult:
        pass

    @abstractmethod
    async def get_positions(self, segment: Optional[str] = None) -> list[Position]:
        pass

    @abstractmethod
    def is_live(self) -> bool:
        """True if real broker; False if paper."""
        pass
