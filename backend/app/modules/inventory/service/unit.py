import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.inventory.models.unit import Unit
from app.modules.inventory.repository import UnitRepository
from app.modules.inventory.schemas import UnitCreate, UnitRead, UnitUpdate


async def get_unit(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> UnitRead:
    obj = await UnitRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Unit not found")
    return UnitRead.model_validate(obj)


async def list_units(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[UnitRead]:
    items = await UnitRepository(db).list_for_tenant(tenant_id, offset, limit)
    return [UnitRead.model_validate(i) for i in items]


async def count_units(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await UnitRepository(db).count_for_tenant(tenant_id)


async def create_unit(db: AsyncSession, tenant_id: uuid.UUID, data: UnitCreate) -> UnitRead:
    obj = Unit(tenant_id=tenant_id, **data.model_dump())
    obj = await UnitRepository(db).save(obj)
    await db.commit()
    return UnitRead.model_validate(obj)


async def update_unit(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: UnitUpdate) -> UnitRead:
    obj = await UnitRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Unit not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    obj = await UnitRepository(db).save(obj)
    await db.commit()
    return UnitRead.model_validate(obj)


async def delete_unit(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await UnitRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Unit not found")
    await UnitRepository(db).delete(obj)
    await db.commit()
