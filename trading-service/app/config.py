"""
Configuration: paper vs live mode, broker choice, and indicator defaults.
Swap broker by changing TRADING_CONNECTOR; strategy layer stays unchanged.
"""
import os
from pydantic_settings import BaseSettings
from typing import Literal


class Settings(BaseSettings):
    # Paper | Live
    TRADING_MODE: Literal["paper", "live"] = "paper"
    # Connector: "paper" | "zerodha" | future brokers
    TRADING_CONNECTOR: str = "paper"
    # Webhook secret (optional) to validate TradingView requests
    WEBHOOK_SECRET: str = ""
    # DB path for orders, positions, alerts
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/trading.db"
    # CORS origins for dashboard (comma-separated)
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"
    # Indicator defaults (can be overridden per alert)
    DEFAULT_MA_FAST: int = 9
    DEFAULT_MA_SLOW: int = 21
    DEFAULT_RSI_PERIOD: int = 14
    DEFAULT_RSI_OVERBOUGHT: float = 70.0
    DEFAULT_RSI_OVERSOLD: float = 30.0

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
