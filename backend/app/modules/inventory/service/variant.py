import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.integrations.storage import storage
from app.modules.inventory.models.variant import ProductVariant
from app.modules.inventory.repository import ProductRepository, VariantRepository
from app.modules.inventory.schemas import VariantCreate, VariantListRead, VariantRead, VariantUpdate


async def _get_product_or_404(db: AsyncSession, tenant_id: uuid.UUID, product_id: uuid.UUID):
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, product_id)
    if obj is None:
        raise NotFoundError("Product not found")
    return obj


async def list_variants(db: AsyncSession, tenant_id: uuid.UUID, product_id: uuid.UUID) -> list[VariantRead]:
    await _get_product_or_404(db, tenant_id, product_id)
    items = await VariantRepository(db).list_for_product(product_id)
    return [VariantRead.model_validate(i) for i in items]


async def list_all_variants(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[VariantListRead]:
    items = await VariantRepository(db).list_for_tenant(tenant_id, offset, limit)
    result = []
    for item in items:
        data = VariantRead.model_validate(item).model_dump()
        data["product_name"] = item.product.name if item.product else None
        data["product_sku"] = item.product.sku if item.product else None
        result.append(VariantListRead(**data))
    return result


async def count_all_variants(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await VariantRepository(db).count_for_tenant(tenant_id)


async def get_variant(db: AsyncSession, tenant_id: uuid.UUID, product_id: uuid.UUID, id: uuid.UUID) -> VariantRead:
    await _get_product_or_404(db, tenant_id, product_id)
    obj = await VariantRepository(db).get_by_id_for_product(product_id, id)
    if obj is None:
        raise NotFoundError("Variant not found")
    return VariantRead.model_validate(obj)


async def create_variant(db: AsyncSession, tenant_id: uuid.UUID, product_id: uuid.UUID, data: VariantCreate) -> VariantRead:
    product = await _get_product_or_404(db, tenant_id, product_id)
    if not product.has_variants:
        # auto-enable has_variants on first variant
        product.has_variants = True
        await ProductRepository(db).save(product)
    obj = ProductVariant(product_id=product_id, **data.model_dump())
    obj = await VariantRepository(db).save(obj)
    await db.commit()
    obj = await VariantRepository(db).get_by_id_for_product(product_id, obj.id)
    return VariantRead.model_validate(obj)


async def update_variant(db: AsyncSession, tenant_id: uuid.UUID, product_id: uuid.UUID, id: uuid.UUID, data: VariantUpdate) -> VariantRead:
    await _get_product_or_404(db, tenant_id, product_id)
    repo = VariantRepository(db)
    obj = await repo.get_by_id_for_product(product_id, id)
    if obj is None:
        raise NotFoundError("Variant not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_product(product_id, id)
    return VariantRead.model_validate(obj)


async def restock_variant(db: AsyncSession, tenant_id: uuid.UUID, product_id: uuid.UUID, id: uuid.UUID, qty: int, mode: str) -> VariantRead:
    await _get_product_or_404(db, tenant_id, product_id)
    repo = VariantRepository(db)
    obj = await repo.get_by_id_for_product(product_id, id)
    if obj is None:
        raise NotFoundError("Variant not found")
    obj.stock = qty if mode == "adjust" else obj.stock + qty
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_product(product_id, id)
    return VariantRead.model_validate(obj)


async def upload_variant_image(db: AsyncSession, tenant_id: uuid.UUID, product_id: uuid.UUID, id: uuid.UUID, filename: str, content: bytes) -> VariantRead:
    await _get_product_or_404(db, tenant_id, product_id)
    repo = VariantRepository(db)
    obj = await repo.get_by_id_for_product(product_id, id)
    if obj is None:
        raise NotFoundError("Variant not found")
    if obj.image_url:
        await storage.delete(obj.image_url)
    obj.image_url = await storage.save("variants", filename, content)
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_product(product_id, id)
    return VariantRead.model_validate(obj)


async def delete_variant(db: AsyncSession, tenant_id: uuid.UUID, product_id: uuid.UUID, id: uuid.UUID) -> None:
    await _get_product_or_404(db, tenant_id, product_id)
    repo = VariantRepository(db)
    obj = await repo.get_by_id_for_product(product_id, id)
    if obj is None:
        raise NotFoundError("Variant not found")
    if obj.image_url:
        await storage.delete(obj.image_url)
    await repo.delete(obj)
    # if no variants left, turn off has_variants
    remaining = await repo.count_for_product(product_id)
    if remaining == 0:
        product = await ProductRepository(db).get_by_id_for_tenant(tenant_id, product_id)
        if product:
            product.has_variants = False
            await ProductRepository(db).save(product)
    await db.commit()
