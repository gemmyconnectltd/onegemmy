import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.manufacturing.models.bom import BillOfMaterial


class BomRepository(BaseRepository[BillOfMaterial]):
    model = BillOfMaterial

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> BillOfMaterial | None:
        # populate_existing: see ProductionOrderRepository.get_by_id_for_tenant —
        # same expire_on_commit=False staleness risk for a just-created object.
        result = await self.db.execute(
            select(BillOfMaterial)
            .options(selectinload(BillOfMaterial.items))
            .where(BillOfMaterial.id == id, BillOfMaterial.tenant_id == tenant_id)
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, offset: int = 0, limit: int = 50) -> list[BillOfMaterial]:
        result = await self.db.execute(
            select(BillOfMaterial)
            .options(selectinload(BillOfMaterial.items))
            .where(BillOfMaterial.tenant_id == tenant_id)
            .order_by(BillOfMaterial.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(BillOfMaterial).where(BillOfMaterial.tenant_id == tenant_id)
        )
        return result.scalar_one()
