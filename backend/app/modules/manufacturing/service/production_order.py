import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.inventory.models.product import Product
from app.modules.manufacturing.models.production_item import ProductionItem
from app.modules.manufacturing.models.production_order import ProductionOrder
from app.modules.manufacturing.repository import ProductionOrderRepository
from app.modules.manufacturing.schemas import (
    ProductionItemCreate,
    ProductionOrderCreate,
    ProductionOrderRead,
    ProductionOrderUpdate,
)

COMPLETED = "Completed"


async def list_production_orders(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 50, branch_id: uuid.UUID | None = None) -> list[ProductionOrderRead]:
    items = await ProductionOrderRepository(db).list_for_tenant(tenant_id, offset, limit, branch_id)
    return [ProductionOrderRead.model_validate(i) for i in items]


async def count_production_orders(db: AsyncSession, tenant_id: uuid.UUID, branch_id: uuid.UUID | None = None) -> int:
    return await ProductionOrderRepository(db).count_for_tenant(tenant_id, branch_id)


async def get_production_order(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> ProductionOrderRead:
    obj = await ProductionOrderRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Production order not found")
    return ProductionOrderRead.model_validate(obj)


async def _resolve_product(db: AsyncSession, tenant_id: uuid.UUID, product_id: uuid.UUID | None, fallback_name: str | None) -> tuple[Product | None, str | None]:
    if product_id is None:
        return None, fallback_name
    product = await db.get(Product, product_id)
    if product is None or product.tenant_id != tenant_id:
        raise ValidationError(f"Product '{product_id}' not found in this tenant")
    return product, product.name


async def _build_items(
    db: AsyncSession, tenant_id: uuid.UUID, order_id: uuid.UUID, items: list[ProductionItemCreate]
) -> list[ProductionItem]:
    created: list[ProductionItem] = []
    for item_data in items:
        product, product_name = await _resolve_product(db, tenant_id, item_data.product_id, item_data.product_name)
        if product is None and product_name is None:
            raise ValidationError("Each component must reference a product or provide a name")
        created.append(ProductionItem(
            production_order_id=order_id,
            product_id=item_data.product_id,
            product_name=product_name,
            quantity_required=item_data.quantity_required,
            wastage_quantity=item_data.wastage_quantity,
        ))
    return created


async def create_production_order(db: AsyncSession, tenant_id: uuid.UUID, data: ProductionOrderCreate, branch_id: uuid.UUID | None = None) -> ProductionOrderRead:
    if data.status == COMPLETED:
        raise ValidationError("Create a draft production order, then complete it to post stock movements")
    repo = ProductionOrderRepository(db)
    _, finished_name = await _resolve_product(db, tenant_id, data.product_id, data.product_name)

    order = ProductionOrder(
        tenant_id=tenant_id,
        order_number=await repo.next_order_number(tenant_id),
        branch_id=branch_id,
        product_id=data.product_id,
        product_name=finished_name or data.product_name,
        quantity=data.quantity,
        status=data.status,
        scheduled_date=data.scheduled_date,
        notes=data.notes,
    )
    order = await repo.save(order)
    for item in await _build_items(db, tenant_id, order.id, data.items):
        db.add(item)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, order.id)
    return ProductionOrderRead.model_validate(obj)


async def update_production_order(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: ProductionOrderUpdate) -> ProductionOrderRead:
    repo = ProductionOrderRepository(db)
    await repo.lock_order(tenant_id, id)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Production order not found")
    if obj.status == COMPLETED:
        raise ConflictError("Cannot modify a completed production order")

    payload = data.model_dump(exclude_unset=True)
    items = payload.pop("items", None)
    if payload.get("status") == COMPLETED:
        if items is not None:
            raise ValidationError("Save component changes before completing production")
        for field, value in payload.items():
            if field != "status":
                setattr(obj, field, value)
        await repo.save(obj)
        await db.flush()
        return await _complete(db, tenant_id, id)

    product_id = payload.get("product_id", obj.product_id)
    product_name = payload.get("product_name", obj.product_name)
    if payload.get("product_id") is not None or payload.get("product_name") is not None:
        _, resolved = await _resolve_product(db, tenant_id, product_id, product_name)
        payload["product_name"] = resolved or product_name
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
    return ProductionOrderRead.model_validate(obj)


async def _lock_products(db: AsyncSession, tenant_id: uuid.UUID, product_ids: set[uuid.UUID]) -> dict[uuid.UUID, Product]:
    if not product_ids:
        return {}
    result = await db.execute(
        select(Product)
        .where(Product.id.in_(product_ids), Product.tenant_id == tenant_id)
        .order_by(Product.id).with_for_update(of=Product).execution_options(populate_existing=True)
    )
    return {p.id: p for p in result.scalars().all()}


async def _complete(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> ProductionOrderRead:
    repo = ProductionOrderRepository(db)
    await repo.lock_order(tenant_id, id)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Production order not found")
    if obj.status == COMPLETED:
        raise ConflictError("Production order is already completed")

    if obj.product_id is None or not obj.items or any(item.product_id is None for item in obj.items):
        raise ValidationError("Link a finished product and all raw materials to inventory before completing production")
    finished_id = obj.product_id
    component_ids = {item.product_id for item in obj.items if item.product_id}
    if finished_id:
        component_ids.add(finished_id)
    locked = await _lock_products(db, tenant_id, component_ids)

    required: dict[uuid.UUID, int] = {}
    for item in obj.items:
        if item.product_id:
            required[item.product_id] = required.get(item.product_id, 0) + item.quantity_required + item.wastage_quantity
    if any(product.has_variants or product.tracks_serials for product in locked.values()):
        raise ValidationError("Variant or serialized manufacturing requires explicit item tracking and is not supported by this production flow")
    for product_id, quantity in required.items():
        product = locked.get(product_id)
        if product is None:
            raise ValidationError("A component is no longer available in this company")
        if product.stock < quantity:
            raise ValidationError(
                f"Insufficient stock for component '{product.name}': "
                f"{product.stock} available, {quantity} required"
            )
    for item in obj.items:
        if item.product_id is None:
            continue
        product = locked.get(item.product_id)
        if product is not None:
            product.stock = product.stock - item.quantity_required - item.wastage_quantity

    if finished_id is not None:
        finished = locked.get(finished_id)
        if finished is None:
            raise ValidationError("Finished product not found in this tenant")
        finished.stock = finished.stock + obj.quantity

    obj.status = COMPLETED
    obj.completed_at = datetime.now(UTC)
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return ProductionOrderRead.model_validate(obj)


async def complete_production_order(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> ProductionOrderRead:
    return await _complete(db, tenant_id, id)


async def delete_production_order(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await ProductionOrderRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Production order not found")
    if obj.status == COMPLETED:
        raise ConflictError("Cannot delete a completed production order")
    await ProductionOrderRepository(db).delete(obj)
    await db.commit()
