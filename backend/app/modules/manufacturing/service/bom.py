import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.inventory.models.product import Product
from app.modules.manufacturing.models.bom import BillOfMaterial, BillOfMaterialItem
from app.modules.manufacturing.repository import BomRepository
from app.modules.manufacturing.schemas import BomCreate, BomItemCreate, BomRead, BomUpdate


async def list_boms(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 50) -> list[BomRead]:
    items = await BomRepository(db).list_for_tenant(tenant_id, offset, limit)
    return [BomRead.model_validate(i) for i in items]


async def count_boms(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await BomRepository(db).count_for_tenant(tenant_id)


async def get_bom(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> BomRead:
    obj = await BomRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Bill of materials not found")
    return BomRead.model_validate(obj)


async def _resolve_product(db: AsyncSession, tenant_id: uuid.UUID, product_id: uuid.UUID | None, fallback_name: str | None) -> str | None:
    if product_id is None:
        return fallback_name
    product = await db.get(Product, product_id)
    if product is None or product.tenant_id != tenant_id:
        raise ValidationError(f"Product '{product_id}' not found in this tenant")
    return product.name


async def _build_items(
    db: AsyncSession, tenant_id: uuid.UUID, bom_id: uuid.UUID, items: list[BomItemCreate]
) -> list[BillOfMaterialItem]:
    created: list[BillOfMaterialItem] = []
    for item_data in items:
        name = await _resolve_product(db, tenant_id, item_data.component_product_id, item_data.component_product_name)
        if item_data.component_product_id is None and name is None:
            raise ValidationError("Each component must reference a product or provide a name")
        created.append(BillOfMaterialItem(
            bom_id=bom_id,
            component_product_id=item_data.component_product_id,
            component_product_name=name,
            quantity_required=item_data.quantity_required,
        ))
    return created


async def create_bom(db: AsyncSession, tenant_id: uuid.UUID, data: BomCreate) -> BomRead:
    repo = BomRepository(db)
    product_name = await _resolve_product(db, tenant_id, data.product_id, data.product_name)

    bom = BillOfMaterial(
        tenant_id=tenant_id,
        name=data.name,
        product_id=data.product_id,
        product_name=product_name,
        notes=data.notes,
    )
    bom = await repo.save(bom)
    for item in await _build_items(db, tenant_id, bom.id, data.items):
        db.add(item)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, bom.id)
    return BomRead.model_validate(obj)


async def update_bom(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: BomUpdate) -> BomRead:
    repo = BomRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Bill of materials not found")

    payload = data.model_dump(exclude_unset=True)
    items = payload.pop("items", None)
    if "product_id" in payload or "product_name" in payload:
        product_id = payload.get("product_id", obj.product_id)
        fallback = payload.get("product_name", obj.product_name)
        payload["product_name"] = await _resolve_product(db, tenant_id, product_id, fallback)
    for field, value in payload.items():
        setattr(obj, field, value)
    if items is not None:
        obj.items.clear()
        await db.flush()
        for item in await _build_items(db, tenant_id, id, items):
            db.add(item)
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return BomRead.model_validate(obj)


async def delete_bom(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await BomRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Bill of materials not found")
    await BomRepository(db).delete(obj)
    await db.commit()
