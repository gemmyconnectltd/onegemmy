import json
from collections.abc import AsyncGenerator
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


def _json_default(value: object) -> object:
    # Numeric columns (money, quantities) come back as Decimal, and UUID
    # primary/foreign keys are common in audit-log `changes` payloads —
    # Python's stdlib json module can't serialize either by default. Without
    # this, any JSON/JSONB insert containing one (e.g. record_audit() logging
    # an expense/order amount) raises a TypeError deep inside the DBAPI call
    # and surfaces as an unhandled 500, not a validation error.
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, UUID):
        return str(value)
    raise TypeError(f"Object of type {value.__class__.__name__} is not JSON serializable")


def _json_serializer(value: object) -> str:
    return json.dumps(value, default=_json_default)


engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    connect_args={"server_settings": {"search_path": "public"}},
    json_serializer=_json_serializer,
)

AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        yield session
