"""Periodic support jobs: WhatsApp health/reconnect, inbound email sync, retention. One asyncio task started at
app startup; every step is a no-op until its channel is configured, and a failure in one never stops the loop."""
import asyncio
from datetime import UTC, datetime

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.modules.support import email_inbound, openwa, service

log = get_logger("support.background")
_last_purge: datetime | None = None


async def _tick() -> None:
    global _last_purge
    if openwa.configured():
        async with AsyncSessionLocal() as db:
            await openwa.health_tick(db)
    if email_inbound.inbound_enabled():
        async with AsyncSessionLocal() as db:
            await email_inbound.sync_mailbox(db)
    if email_inbound.outbound_configured():
        async with AsyncSessionLocal() as db:
            await email_inbound.dispatch_due(db)
    if _last_purge is None or (datetime.now(UTC) - _last_purge).total_seconds() > 3600:
        _last_purge = datetime.now(UTC)
        async with AsyncSessionLocal() as db:
            await service.purge_old_conversations(db)


async def run_forever(interval: int = 60) -> None:
    while True:
        try:
            await _tick()
        except Exception:
            log.exception("support.background_error")
        await asyncio.sleep(interval)


def start() -> asyncio.Task | None:
    if not settings.SUPPORT_BACKGROUND or not (openwa.configured() or email_inbound.inbound_enabled() or email_inbound.outbound_configured()):
        return None
    return asyncio.create_task(run_forever())
