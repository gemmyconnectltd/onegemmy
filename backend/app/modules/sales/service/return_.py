import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.stock_context import set_reason
from app.modules.accounting.service.transaction import create_return_transaction
from app.modules.currency.service import document_currency, document_rate, get_base_currency
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.variant import ProductVariant
from app.modules.inventory.service.serial import mark_serials_returned
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_item import OrderItem
from app.modules.sales.models.return_ import Return
from app.modules.sales.models.return_item import ReturnItem
from app.modules.sales.repository import ReturnRepository
from app.modules.sales.schemas import ReturnCreate, ReturnRead, ReturnUpdate
from app.modules.sales.service.order import _base_value


async def _stamp_return_currency(db: AsyncSession, tenant_id: uuid.UUID, ret: Return) -> float:
    """Give a return the currency and FROZEN rate of the order it reverses, and derive the refund's
    base-currency value from them. A return undoes a historical sale, so it must use that sale's
    rate — never today's. A return with no order is a base-currency refund. Returns the base refund
    (what the ledger posts)."""
    base = await get_base_currency(db, tenant_id)
    order = await db.get(Order, ret.order_id) if ret.order_id else None
    if order is not None and order.tenant_id != tenant_id:
        order = None  # never read another tenant's order, even by a forged id
    code = document_currency(order, base) if order else base
    rate = document_rate(order) if order else Decimal(1)
    ret.currency_code, ret.exchange_rate = code, rate
    ret.base_refund_amount = _base_value(ret.refund_amount, code, base, rate)
    return float(ret.base_refund_amount)


async def _restock(db: AsyncSession, product_id: uuid.UUID | None, variant_id: uuid.UUID | None, quantity: float) -> None:
    """Puts a returned quantity back into sellable stock."""
    set_reason("customer_return", reference_type="return")
    if variant_id:
        variant = await db.get(ProductVariant, variant_id)
        if variant is not None:
            variant.stock = float(variant.stock) + quantity
    elif product_id:
        product = await db.get(Product, product_id)
        if product is not None:
            product.stock = float(product.stock) + quantity


async def _restock_return_item(db: AsyncSession, item: ReturnItem) -> None:
    """Resolves a persisted return line's product/variant and restocks it."""
    variant_id = item.order_item.variant_id if item.order_item else None
    product_id = item.product_id or (item.order_item.product_id if item.order_item else None)
    await _restock(db, product_id, variant_id, item.quantity)


async def list_returns(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50, period=None) -> list[ReturnRead]:
    items = await ReturnRepository(db).list_for_tenant(tenant_id, status, offset, limit, period)
    return [ReturnRead.model_validate(i) for i in items]


async def count_returns(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, period=None) -> int:
    return await ReturnRepository(db).count_for_tenant(tenant_id, status, period)


async def get_return(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> ReturnRead:
    obj = await ReturnRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Return not found")
    return ReturnRead.model_validate(obj)


async def _check_quantities(db: AsyncSession, tenant_id: uuid.UUID, data: ReturnCreate) -> None:
    """A line cannot come back in larger quantity than was sold, counting what earlier (not rejected) returns already took back."""
    from sqlalchemy import func, select

    from app.modules.discounts.engine import money
    from app.modules.sales.models.order import Order
    for item in data.items:
        if not item.order_item_id:
            continue
        sold = (await db.execute(select(OrderItem).join(Order, Order.id == OrderItem.order_id).where(
            Order.tenant_id == tenant_id, OrderItem.id == item.order_item_id,
        ))).unique().scalar_one_or_none()
        if sold is None or (data.order_id and sold.order_id != data.order_id):
            raise ValidationError("A returned line does not belong to that sale")
        already = (await db.execute(
            select(func.coalesce(func.sum(ReturnItem.quantity), 0)).join(Return, Return.id == ReturnItem.return_id)
            .where(Return.tenant_id == tenant_id, ReturnItem.order_item_id == item.order_item_id, Return.status != "Rejected"))).scalar_one()
        if float(already) + float(item.quantity) > float(sold.quantity) + 1e-9:
            raise ValidationError(f"Only {float(sold.quantity) - float(already):g} of '{sold.product_name}' can still be returned ({float(sold.quantity):g} sold, {float(already):g} already returned)")
        # Refund frozen allocated sale prices, never a cashier-supplied amount or current promotion.
        order = await db.get(Order, sold.order_id)
        data.order_id = order.id
        if data.customer_id is not None and data.customer_id != order.customer_id:
            raise ValidationError("A refund must use the original sale customer")
        data.customer_id = order.customer_id
        if order.status != "Completed":
            raise ValidationError("Only completed sale lines may be returned")
        original_line = Decimal(str(sold.line_total))
        if order.discount and order.subtotal:
            original_line = money(original_line * (Decimal(str(order.subtotal)) - Decimal(str(order.discount))) / Decimal(str(order.subtotal)))
        unit_refund = min(original_line / Decimal(str(sold.quantity)), Decimal(str(item.refund_per_unit)))
        previous_refund = await db.scalar(select(func.coalesce(func.sum(ReturnItem.line_refund), 0)).join(Return, Return.id == ReturnItem.return_id).where(
            Return.tenant_id == tenant_id, ReturnItem.order_item_id == item.order_item_id, Return.status != "Rejected"))
        refund = min(money(unit_refund * Decimal(str(item.quantity))), max(original_line - Decimal(str(previous_refund)), Decimal(0)))
        item.refund_per_unit = float(unit_refund)
        item.line_refund = float(refund)
        item.product_id = sold.product_id
        item.product_name = sold.product_name


async def _snapshot_return_vat(db: AsyncSession, item: ReturnItem) -> None:
    """The VAT this return reverses: the original sale line's own recorded VAT, in proportion to the refund (never today's
    rate or the product's current treatment). Lines sold before line-level VAT keep no snapshot and are reversed as before."""
    if not item.order_item_id:
        return
    sold = await db.get(OrderItem, item.order_item_id)
    if sold is None or sold.tax_amount is None or sold.taxable_base is None:
        return
    from decimal import Decimal

    from app.modules.tax.engine import reverse
    gross = Decimal(str(sold.taxable_base)) + Decimal(str(sold.tax_amount))
    _, tax_back = reverse(sold.taxable_base, sold.tax_amount, gross, Decimal(str(item.line_refund)))
    item.tax_treatment, item.tax_rate, item.tax_amount = sold.tax_treatment, sold.tax_rate, tax_back


async def create_return(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, data: ReturnCreate) -> ReturnRead:
    from app.modules.sales.repository import OrderRepository
    await OrderRepository(db).lock_financial_writes(tenant_id)
    await _check_quantities(db, tenant_id, data)
    repo = ReturnRepository(db)
    return_number = await repo.next_return_number(tenant_id)
    refund_amount = sum(item.line_refund for item in data.items)

    ret = Return(
        tenant_id=tenant_id,
        return_number=return_number,
        order_id=data.order_id,
        customer_id=data.customer_id,
        reason=data.reason,
        refund_amount=refund_amount,
        refund_method=data.refund_method,
        status=data.status,
        return_date=data.return_date,
        processed_by=user_id if data.status != "Pending" else None,
    )
    ret = await repo.save(ret)
    base_refund = await _stamp_return_currency(db, tenant_id, ret)

    for item_data in data.items:
        item = ReturnItem(
            return_id=ret.id,
            order_item_id=item_data.order_item_id,
            product_id=item_data.product_id,
            product_name=item_data.product_name,
            quantity=item_data.quantity,
            refund_per_unit=item_data.refund_per_unit,
            line_refund=item_data.line_refund,
        )
        await _snapshot_return_vat(db, item)
        db.add(item)

        # a return can be recorded as already Approved in one step (not just via a later
        # Pending -> Approved edit) — restock immediately so this path isn't missed
        if data.status == "Approved":
            variant_id = None
            product_id = item_data.product_id
            if item_data.order_item_id:
                order_item = await db.get(OrderItem, item_data.order_item_id)
                if order_item is not None:
                    variant_id = order_item.variant_id
                    product_id = product_id or order_item.product_id
            await _restock(db, product_id, variant_id, item_data.quantity)

    if data.status == "Approved":
        await create_return_transaction(db, tenant_id, user_id, ret.id, base_refund, return_number)
        order_item_ids = [i.order_item_id for i in data.items if i.order_item_id]
        await mark_serials_returned(db, tenant_id, order_item_ids)

    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, ret.id)
    return ReturnRead.model_validate(obj)


async def update_return(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id: uuid.UUID, data: ReturnUpdate) -> ReturnRead:
    obj = await ReturnRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Return not found")
    updates = data.model_dump(exclude_unset=True)
    # auto-set processed_by when status moves from Pending
    if "status" in updates and updates["status"] != "Pending" and obj.processed_by is None:
        updates.setdefault("processed_by", user_id)
    was_approved = obj.status == "Approved"
    for field, value in updates.items():
        setattr(obj, field, value)
    await ReturnRepository(db).save(obj)
    # auto-create accounting transaction + restock inventory when status flips to Approved
    if not was_approved and obj.status == "Approved":
        for item in obj.items:
            await _restock_return_item(db, item)
        base_refund = await _stamp_return_currency(db, tenant_id, obj)
        await create_return_transaction(
            db, tenant_id, user_id, obj.id, base_refund, obj.return_number
        )
        order_item_ids = [i.order_item_id for i in obj.items if i.order_item_id]
        await mark_serials_returned(db, tenant_id, order_item_ids)
    await db.commit()
    obj = await ReturnRepository(db).get_by_id_for_tenant(tenant_id, id)
    return ReturnRead.model_validate(obj)


async def delete_return(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await ReturnRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Return not found")
    await ReturnRepository(db).delete(obj)
    await db.commit()
