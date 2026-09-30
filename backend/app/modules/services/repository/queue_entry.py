import uuid

from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.core.repository import BaseRepository
from app.modules.services.models.queue_entry import QueueEntry

_EAGER = (
    joinedload(QueueEntry.branch),
    joinedload(QueueEntry.customer),
    joinedload(QueueEntry.service),
    joinedload(QueueEntry.employee),
)


class QueueEntryRepository(BaseRepository[QueueEntry]):
    model = QueueEntry

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> QueueEntry | None:
        result = await self.db.execute(
            select(QueueEntry).options(*_EAGER).where(QueueEntry.id == id, QueueEntry.tenant_id == tenant_id)
        )
        return result.unique().scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, status: str | None = None) -> list[QueueEntry]:
        stmt = select(QueueEntry).options(*_EAGER).where(QueueEntry.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(QueueEntry.status == status)
        stmt = stmt.order_by(QueueEntry.checked_in_at)
        result = await self.db.execute(stmt)
        return list(result.unique().scalars().all())
