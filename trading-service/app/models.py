"""
SQLite storage for alerts, orders, positions, and closed trades.
Sub-second write so webhook → order is &lt; 1 s.
"""
import aiosqlite
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

from .connectors.base import Position

DB_PATH = os.getenv("TRADING_DB_PATH", "./data/trading.db")


def _ensure_dir():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)


async def get_connection():
    _ensure_dir()
    return await aiosqlite.connect(DB_PATH)


async def init_db(conn: aiosqlite.Connection):
    await conn.executescript("""
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            received_at TEXT NOT NULL,
            payload TEXT NOT NULL,
            segment TEXT NOT NULL,
            order_id TEXT,
            status TEXT NOT NULL DEFAULT 'received'
        );
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT UNIQUE NOT NULL,
            segment TEXT NOT NULL,
            symbol TEXT NOT NULL,
            side TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            order_type TEXT,
            price REAL,
            product TEXT,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS positions (
            segment TEXT NOT NULL,
            symbol TEXT NOT NULL,
            side TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            avg_price REAL NOT NULL,
            order_id TEXT,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (segment, symbol, side)
        );
        CREATE TABLE IF NOT EXISTS closed_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            segment TEXT NOT NULL,
            symbol TEXT NOT NULL,
            side TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            entry_price REAL NOT NULL,
            exit_price REAL NOT NULL,
            pnl REAL NOT NULL,
            closed_at TEXT NOT NULL,
            order_id TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_alerts_segment ON alerts(segment);
        CREATE INDEX IF NOT EXISTS idx_orders_segment ON orders(segment);
        CREATE INDEX IF NOT EXISTS idx_positions_segment ON positions(segment);
        CREATE INDEX IF NOT EXISTS idx_closed_segment ON closed_trades(segment);
    """)
    await conn.commit()


class OrderStore:
    def __init__(self, conn: aiosqlite.Connection):
        self._conn = conn

    async def append_alert(self, payload: str, segment: str, order_id: Optional[str] = None, status: str = "received"):
        await self._conn.execute(
            "INSERT INTO alerts (received_at, payload, segment, order_id, status) VALUES (?, ?, ?, ?, ?)",
            (datetime.utcnow().isoformat() + "Z", payload, segment, order_id or "", status),
        )
        await self._conn.commit()

    async def append_order(
        self,
        order_id: str,
        segment: str,
        symbol: str,
        side: str,
        quantity: int,
        order_type: str = "MARKET",
        price: Optional[float] = None,
        product: str = "MIS",
        status: str = "placed",
    ):
        await self._conn.execute(
            """INSERT INTO orders (order_id, segment, symbol, side, quantity, order_type, price, product, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (order_id, segment, symbol, side, quantity, order_type, price, product, status, datetime.utcnow().isoformat() + "Z"),
        )
        await self._conn.commit()

    async def upsert_position(self, segment: str, symbol: str, side: str, quantity: int, avg_price: float, order_id: Optional[str] = None):
        now = datetime.utcnow().isoformat() + "Z"
        await self._conn.execute(
            """INSERT OR REPLACE INTO positions (segment, symbol, side, quantity, avg_price, order_id, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (segment, symbol, side, quantity, avg_price, order_id or "", now),
        )
        await self._conn.commit()

    async def get_positions(self, segment: Optional[str] = None) -> list[Position]:
        if segment:
            cursor = await self._conn.execute("SELECT symbol, segment, side, quantity, avg_price FROM positions WHERE segment = ?", (segment,))
        else:
            cursor = await self._conn.execute("SELECT symbol, segment, side, quantity, avg_price FROM positions")
        rows = await cursor.fetchall()
        return [Position(symbol=r[0], segment=r[1], side=r[2], quantity=r[3], avg_price=r[4]) for r in rows]

    async def get_orders(self, segment: Optional[str] = None, limit: int = 200):
        if segment:
            cursor = await self._conn.execute(
                "SELECT order_id, segment, symbol, side, quantity, order_type, price, product, status, created_at FROM orders WHERE segment = ? ORDER BY id DESC LIMIT ?",
                (segment, limit),
            )
        else:
            cursor = await self._conn.execute(
                "SELECT order_id, segment, symbol, side, quantity, order_type, price, product, status, created_at FROM orders ORDER BY id DESC LIMIT ?",
                (limit,),
            )
        return await cursor.fetchall()

    async def get_closed_trades(self, segment: Optional[str] = None, limit: int = 500):
        if segment:
            cursor = await self._conn.execute(
                "SELECT segment, symbol, side, quantity, entry_price, exit_price, pnl, closed_at, order_id FROM closed_trades WHERE segment = ? ORDER BY id DESC LIMIT ?",
                (segment, limit),
            )
        else:
            cursor = await self._conn.execute(
                "SELECT segment, symbol, side, quantity, entry_price, exit_price, pnl, closed_at, order_id FROM closed_trades ORDER BY id DESC LIMIT ?",
                (limit,),
            )
        return await cursor.fetchall()

    async def get_alerts(self, segment: Optional[str] = None, limit: int = 200):
        if segment:
            cursor = await self._conn.execute(
                "SELECT id, received_at, payload, segment, order_id, status FROM alerts WHERE segment = ? ORDER BY id DESC LIMIT ?",
                (segment, limit),
            )
        else:
            cursor = await self._conn.execute(
                "SELECT id, received_at, payload, segment, order_id, status FROM alerts ORDER BY id DESC LIMIT ?",
                (limit,),
            )
        return await cursor.fetchall()
