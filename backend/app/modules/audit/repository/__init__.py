import uuid

from sqlalchemy import func, or_, select

from app.core.repository import BaseRepository
from app.modules.audit.models import AuditLog


class AuditLogRepository(BaseRepository[AuditLog]):
    model = AuditLog

    def _user_activity_filter(self, tenant_id: uuid.UUID, user_id: uuid.UUID):
        """"View user activity" shows two related trails: things the user did
        (they were the actor) and things done to their account (an admin
        edited, reset or removed them — those rows have them as the entity).
        Both halves stay inside the caller's tenant."""
        return or_(
            AuditLog.actor_user_id == user_id,
            (AuditLog.entity_type == "user") & (AuditLog.entity_id == str(user_id)),
        )

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

    async def list_user_activity(
        self, tenant_id: uuid.UUID, user_id: uuid.UUID, offset: int = 0, limit: int = 20
    ) -> list[AuditLog]:
        result = await self.db.execute(
            select(AuditLog)
            .where(AuditLog.tenant_id == tenant_id, self._user_activity_filter(tenant_id, user_id))
            .order_by(AuditLog.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_user_activity(self, tenant_id: uuid.UUID, user_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count())
            .select_from(AuditLog)
            .where(AuditLog.tenant_id == tenant_id, self._user_activity_filter(tenant_id, user_id))
        )
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
