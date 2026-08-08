import uuid

from sqlalchemy import func, select

from app.core.repository import BaseRepository
from app.modules.crm.models.email_log import EmailLog


class EmailLogRepository(BaseRepository[EmailLog]):
    model = EmailLog

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> EmailLog | None:
        result = await self.db.execute(
            select(EmailLog).where(EmailLog.id == id, EmailLog.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, offset: int = 0, limit: int = 50) -> list[EmailLog]:
        result = await self.db.execute(
            select(EmailLog)
            .where(EmailLog.tenant_id == tenant_id)
            .order_by(EmailLog.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(EmailLog).where(EmailLog.tenant_id == tenant_id)
        )
        return result.scalar_one()

    async def list_by_campaign_for_tenant(
        self, tenant_id: uuid.UUID, campaign_id: uuid.UUID, offset: int = 0, limit: int = 50
    ) -> list[EmailLog]:
        result = await self.db.execute(
            select(EmailLog)
            .where(EmailLog.tenant_id == tenant_id, EmailLog.campaign_id == campaign_id)
            .order_by(EmailLog.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())
