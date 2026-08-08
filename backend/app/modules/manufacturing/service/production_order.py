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


async def list_production_orders(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 50) -> list[ProductionOrderRead]:
    items = await ProductionOrderRepository(db).list_for_tenant(tenant_id, offset, limit)
    return [ProductionOrderRead.model_validate(i) for i in items]


async def count_production_orders(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await ProductionOrderRepository(db).count_for_tenant(tenant_id)


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
        ))
    return created


async def create_production_order(db: AsyncSession, tenant_id: uuid.UUID, data: ProductionOrderCreate) -> ProductionOrderRead:
    repo = ProductionOrderRepository(db)
    _, finished_name = await _resolve_product(db, tenant_id, data.product_id, data.product_name)

    order = ProductionOrder(
        tenant_id=tenant_id,
        order_number=await repo.next_order_number(tenant_id),
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
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Production order not found")
    if obj.status == COMPLETED and data.status not in (None, COMPLETED):
        raise ConflictError("Cannot modify a completed production order")

    payload = data.model_dump(exclude_unset=True)
    items = payload.pop("items", None)
    if payload.get("status") == COMPLETED:
        for field, value in payload.items():
            if field != "status":
                setattr(obj, field, value)
        await repo.save(obj)
        await db.commit()
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
        .with_for_update(of=Product)
    )
    return {p.id: p for p in result.scalars().all()}


async def _complete(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> ProductionOrderRead:
    repo = ProductionOrderRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Production order not found")
    if obj.status == COMPLETED:
        raise ConflictError("Production order is already completed")

    finished_id = obj.product_id
    component_ids = {item.product_id for item in obj.items if item.product_id}
    if finished_id:
        component_ids.add(finished_id)
    locked = await _lock_products(db, tenant_id, component_ids)

    for item in obj.items:
        if item.product_id is None:
            continue
        product = locked.get(item.product_id)
        if product is None:
            raise ValidationError(f"Component '{item.product_name or item.product_id}' not found in this tenant")
        if product.stock < item.quantity_required:
            raise ValidationError(
                f"Insufficient stock for component '{product.name}': "
                f"{product.stock} available, {item.quantity_required} required"
            )
    for item in obj.items:
        if item.product_id is None:
            continue
        product = locked.get(item.product_id)
        if product is not None:
            product.stock = product.stock - item.quantity_required

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
