import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.repository import BaseRepository
from app.modules.crm.models.activity import Activity


class ActivityRepository(BaseRepository[Activity]):
    model = Activity

    def __init__(self, db: AsyncSession):
        super().__init__(db)

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Activity | None:
        result = await self.db.execute(
            select(Activity).where(Activity.id == id, Activity.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(
        self,
        tenant_id: uuid.UUID,
        offset: int = 0,
        limit: int = 50,
        customer_id: uuid.UUID | None = None,
        deal_id: uuid.UUID | None = None,
        status: str | None = None,
        search: str | None = None,
    ) -> list[Activity]:
        stmt = select(Activity).where(Activity.tenant_id == tenant_id)
        if customer_id:
            stmt = stmt.where(Activity.customer_id == customer_id)
        if deal_id:
            stmt = stmt.where(Activity.deal_id == deal_id)
        if status:
            stmt = stmt.where(Activity.status == status)
        if search:
            stmt = stmt.where(
                Activity.subject.ilike(f"%{search.strip()}%")
                | Activity.description.ilike(f"%{search.strip()}%")
            )
        result = await self.db.execute(
            stmt.order_by(Activity.due_at.is_(None), Activity.due_at.asc(), Activity.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_for_tenant(
        self,
        tenant_id: uuid.UUID,
        customer_id: uuid.UUID | None = None,
        deal_id: uuid.UUID | None = None,
        status: str | None = None,
        search: str | None = None,
    ) -> int:
        stmt = select(func.count()).select_from(Activity).where(Activity.tenant_id == tenant_id)
        if customer_id:
            stmt = stmt.where(Activity.customer_id == customer_id)
        if deal_id:
            stmt = stmt.where(Activity.deal_id == deal_id)
        if status:
            stmt = stmt.where(Activity.status == status)
        if search:
            stmt = stmt.where(
                Activity.subject.ilike(f"%{search.strip()}%")
                | Activity.description.ilike(f"%{search.strip()}%")
            )
        result = await self.db.execute(stmt)
        return result.scalar_one()
