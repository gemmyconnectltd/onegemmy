import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.modules.shops.models import Shop
from app.modules.shops.repository import ShopRepository
from app.modules.shops.schemas import ShopCreate, ShopUpdate

log = get_logger("shops")


async def get_by_id(db: AsyncSession, tenant_id: uuid.UUID, shop_id: uuid.UUID) -> Shop:
    shop = await ShopRepository(db).get_by_id_for_tenant(tenant_id, shop_id)
    if shop is None:
        log.warning("shops.get_by_id.not_found", extra={"_extra_fields": {"shop_id": str(shop_id), "tenant_id": str(tenant_id)}})
        raise NotFoundError("Shop not found")
    return shop


async def list_for_tenant(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[Shop]:
    return await ShopRepository(db).list_for_tenant(tenant_id, offset, limit)


async def count_for_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await ShopRepository(db).count_for_tenant(tenant_id)


async def create(db: AsyncSession, tenant_id: uuid.UUID, data: ShopCreate) -> Shop:
    log.info("shops.create.attempt", extra={"_extra_fields": {"name": data.name, "tenant_id": str(tenant_id)}})
    shop = Shop(tenant_id=tenant_id, **data.model_dump())
    shop = await ShopRepository(db).save(shop)
    log.info("shops.create.success", extra={"_extra_fields": {"shop_id": str(shop.id)}})
    return shop


async def update(db: AsyncSession, shop: Shop, data: ShopUpdate) -> Shop:
    fields = list(data.model_dump(exclude_unset=True).keys())
    log.info("shops.update.attempt", extra={"_extra_fields": {"shop_id": str(shop.id), "fields": fields}})

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(shop, field, value)
    shop = await ShopRepository(db).save(shop)
    log.info("shops.update.success", extra={"_extra_fields": {"shop_id": str(shop.id)}})
    return shop


async def delete(db: AsyncSession, shop: Shop) -> None:
    log.info("shops.delete.attempt", extra={"_extra_fields": {"shop_id": str(shop.id), "name": shop.name}})
    await ShopRepository(db).delete(shop)
    log.info("shops.delete.success", extra={"_extra_fields": {"shop_id": str(shop.id)}})
