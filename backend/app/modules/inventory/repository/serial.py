import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.inventory.models.serial import ProductSerial, WarrantyClaim


class SerialRepository(BaseRepository[ProductSerial]):
    model = ProductSerial

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> ProductSerial | None:
        result = await self.db.execute(
            select(ProductSerial)
            .options(selectinload(ProductSerial.product), selectinload(ProductSerial.variant))
            .where(ProductSerial.id == id, ProductSerial.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def get_by_serial_number(self, tenant_id: uuid.UUID, serial_number: str) -> ProductSerial | None:
        result = await self.db.execute(
            select(ProductSerial).where(
                ProductSerial.tenant_id == tenant_id,
                ProductSerial.serial_number == serial_number,
            )
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(
        self,
        tenant_id: uuid.UUID,
        product_id: uuid.UUID | None = None,
        status: str | None = None,
        offset: int = 0,
        limit: int = 20,
    ) -> list[ProductSerial]:
        stmt = (
            select(ProductSerial)
            .options(selectinload(ProductSerial.product), selectinload(ProductSerial.variant))
            .where(ProductSerial.tenant_id == tenant_id)
        )
        if product_id:
            stmt = stmt.where(ProductSerial.product_id == product_id)
        if status:
            stmt = stmt.where(ProductSerial.status == status)
        stmt = stmt.order_by(ProductSerial.serial_number).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(
        self, tenant_id: uuid.UUID, product_id: uuid.UUID | None = None, status: str | None = None
    ) -> int:
        stmt = select(func.count()).select_from(ProductSerial).where(ProductSerial.tenant_id == tenant_id)
        if product_id:
            stmt = stmt.where(ProductSerial.product_id == product_id)
        if status:
            stmt = stmt.where(ProductSerial.status == status)
        result = await self.db.execute(stmt)
        return result.scalar_one()


class WarrantyRepository(BaseRepository[WarrantyClaim]):
    model = WarrantyClaim

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> WarrantyClaim | None:
        result = await self.db.execute(
            select(WarrantyClaim)
            .options(selectinload(WarrantyClaim.serial))
            .where(WarrantyClaim.id == id, WarrantyClaim.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(
        self,
        tenant_id: uuid.UUID,
        status: str | None = None,
        offset: int = 0,
        limit: int = 20,
    ) -> list[WarrantyClaim]:
        stmt = (
            select(WarrantyClaim)
            .options(selectinload(WarrantyClaim.serial))
            .where(WarrantyClaim.tenant_id == tenant_id)
        )
        if status:
            stmt = stmt.where(WarrantyClaim.status == status)
        stmt = stmt.order_by(WarrantyClaim.submitted_at.desc()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, status: str | None = None) -> int:
        stmt = select(func.count()).select_from(WarrantyClaim).where(WarrantyClaim.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(WarrantyClaim.status == status)
        result = await self.db.execute(stmt)
        return result.scalar_one()
