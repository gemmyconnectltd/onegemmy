import uuid

from sqlalchemy import func, select

from app.core.repository import BaseRepository
from app.modules.audit.models import AuditLog


class AuditLogRepository(BaseRepository[AuditLog]):
    model = AuditLog

    async def list_for_tenant(
        self,
        tenant_id: uuid.UUID,
        offset: int = 0,
        limit: int = 20,
        action: str | None = None,
        entity_type: str | None = None,
    ) -> list[AuditLog]:
        stmt = select(AuditLog).where(AuditLog.tenant_id == tenant_id)
        if action:
            stmt = stmt.where(AuditLog.action == action)
        if entity_type:
            stmt = stmt.where(AuditLog.entity_type == entity_type)
        stmt = stmt.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(
        self,
        tenant_id: uuid.UUID,
        action: str | None = None,
        entity_type: str | None = None,
    ) -> int:
        stmt = select(func.count()).select_from(AuditLog).where(AuditLog.tenant_id == tenant_id)
        if action:
            stmt = stmt.where(AuditLog.action == action)
        if entity_type:
            stmt = stmt.where(AuditLog.entity_type == entity_type)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def get_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> AuditLog | None:
        result = await self.db.execute(
            select(AuditLog).where(AuditLog.id == id, AuditLog.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_platform(self, offset: int = 0, limit: int = 20) -> list[AuditLog]:
        result = await self.db.execute(
            select(AuditLog).order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)
        )
        return list(result.scalars().all())

    async def count_platform(self) -> int:
        result = await self.db.execute(select(func.count()).select_from(AuditLog))
        return result.scalar_one()
