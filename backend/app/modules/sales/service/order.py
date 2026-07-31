import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.inventory.models.product import Product
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_item import OrderItem
from app.modules.sales.repository import OrderRepository
from app.modules.sales.schemas import OrderCreate, OrderRead, OrderUpdate


async def list_orders(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50) -> list[OrderRead]:
    items = await OrderRepository(db).list_for_tenant(tenant_id, status, offset, limit)
    return [OrderRead.model_validate(i) for i in items]


async def count_orders(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None) -> int:
    return await OrderRepository(db).count_for_tenant(tenant_id, status)


async def get_order(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> OrderRead:
    obj = await OrderRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Order not found")
    return OrderRead.model_validate(obj)


async def create_order(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, data: OrderCreate) -> OrderRead:
    repo = OrderRepository(db)
    order_number = await repo.next_order_number(tenant_id)

    subtotal = sum(item.line_total for item in data.items)
    total = round(subtotal - data.discount + data.tax, 2)

    order = Order(
        tenant_id=tenant_id,
        order_number=order_number,
        customer_id=data.customer_id,
        deal_id=data.deal_id,
        branch_id=data.branch_id,
        created_by=user_id,
        status=data.status,
        subtotal=subtotal,
        discount=data.discount,
        tax=data.tax,
        total=total,
        notes=data.notes,
    )
    order = await repo.save(order)

    for item_data in data.items:
        item = OrderItem(
            order_id=order.id,
            product_id=item_data.product_id,
            product_name=item_data.product_name,
            sku=item_data.sku,
            unit_price=item_data.unit_price,
            quantity=item_data.quantity,
            discount=item_data.discount,
            line_total=item_data.line_total,
        )
        db.add(item)

        # deduct stock when order is Completed
        if data.status == "Completed" and item_data.product_id:
            product = await db.get(Product, item_data.product_id)
            if product:
                product.stock = max(0, product.stock - item_data.quantity)

    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, order.id)
    return OrderRead.model_validate(obj)


async def update_order(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: OrderUpdate) -> OrderRead:
    obj = await OrderRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Order not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    # recompute total if discount or tax changed
    obj.total = round(float(obj.subtotal) - float(obj.discount) + float(obj.tax), 2)
    await OrderRepository(db).save(obj)
    await db.commit()
    obj = await OrderRepository(db).get_by_id_for_tenant(tenant_id, id)
    return OrderRead.model_validate(obj)


async def delete_order(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await OrderRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Order not found")
    if obj.status == "Completed":
        raise ValidationError("Cannot delete a completed order")
    await OrderRepository(db).delete(obj)
    await db.commit()
