import uuid
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.procurement.models.purchase_return import PurchaseReturn
from app.modules.procurement.repository import PurchaseOrderRepository
from app.modules.procurement.repository.purchase_return import PurchaseReturnRepository
from app.modules.procurement.schemas.purchase_return import PurchaseReturnCreate, PurchaseReturnRead


def _to_read(obj: PurchaseReturn) -> PurchaseReturnRead:
    read = PurchaseReturnRead.model_validate(obj)
    read.po_reference = obj.purchase_order.reference if obj.purchase_order else None
    read.supplier_name = obj.purchase_order.supplier.name if obj.purchase_order and obj.purchase_order.supplier else None
    return read


async def list_returns(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 50, branch_id=None, search=None) -> list[PurchaseReturnRead]:
    items = await PurchaseReturnRepository(db).list_for_tenant(tenant_id, offset, limit, branch_id, search)
    return [_to_read(i) for i in items]


async def count_returns(db: AsyncSession, tenant_id: uuid.UUID, branch_id=None, search=None) -> int:
    return await PurchaseReturnRepository(db).count_for_tenant(tenant_id, branch_id, search)


async def get_return(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> PurchaseReturnRead:
    obj = await PurchaseReturnRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Return not found")
    return _to_read(obj)


async def _create_return(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, data: PurchaseReturnCreate) -> PurchaseReturnRead:
    from app.modules.accounting.repository.reporting import ReportingRepository
    from app.modules.audit.service import record_audit
    from app.modules.procurement.repository.pricing import PurchasePricingRepository
    await ReportingRepository(db).lock_tenant(tenant_id)
    if data.client_reference:
        prior = await PurchaseReturnRepository(db).by_client(tenant_id, data.client_reference)
        if prior:
            if prior.purchase_order_id != data.purchase_order_id or prior.product_id != data.product_id or prior.variant_id != data.variant_id or Decimal(prior.quantity) != data.quantity or prior.reason != data.reason:
                from app.core.exceptions import ConflictError
                raise ConflictError("Return reference was already used with different details")
            return _to_read(prior)
    po = await PurchaseOrderRepository(db).get_by_id_for_tenant(tenant_id, data.purchase_order_id)
    if po is None:
        raise NotFoundError("Purchase order not found")
    from app.modules.procurement.service.purchase import _require_purchase_actor
    await _require_purchase_actor(db, tenant_id, user_id, "update", po.branch_id)
    if po.status not in ("Received", "PartiallyReceived", "Closed"):
        raise ValidationError("Can only return items from a received purchase order")

    if data.return_date and (data.return_date > datetime.now(UTC).date() or (po.order_date and data.return_date < po.order_date)):
        raise ValidationError("Return date must be between the order date and today")
    if not data.reason.strip():
        raise ValidationError("A return reason is required")
    eligible = [i for i in po.items if not i.is_service and i.product_id == data.product_id and i.variant_id == data.variant_id]
    if not eligible:
        raise ValidationError("The returned product must belong to this purchase")
    already = await db.scalar(select(func.coalesce(func.sum(PurchaseReturn.quantity), 0)).where(
        PurchaseReturn.tenant_id == tenant_id, PurchaseReturn.purchase_order_id == po.id,
        PurchaseReturn.product_id == data.product_id, PurchaseReturn.variant_id == data.variant_id, PurchaseReturn.status.not_in(["Cancelled", "Replaced"])))
    received = sum((Decimal(i.received_quantity) for i in eligible), Decimal(0))
    if data.quantity > received - Decimal(already):
        raise ValidationError("Return quantity exceeds received quantity less previous returns")
    products, variants = await PurchasePricingRepository(db).catalog(tenant_id, eligible)
    product = products.get(data.product_id)
    target = variants.get(data.variant_id) if data.variant_id else product
    if product is None or target is None:
        raise ValidationError("Purchase product is no longer available")
    factors = {Decimal(i.stock_factor) if i.stock_factor is not None else Decimal(str(product.conversion_factor)) for i in eligible}
    if len(factors) != 1:
        raise ValidationError("These purchase lines have different units; reconcile the return in Inventory")
    delta = data.quantity * factors.pop()
    if delta > Decimal(str(target.stock)):
        raise ValidationError("Not enough stock to return these goods")
    target.stock = Decimal(str(target.stock)) - delta
    data.product_name = eligible[0].product_name

    repo = PurchaseReturnRepository(db)
    reference = await repo.next_reference(tenant_id)
    from app.modules.currency.service import document_rate
    received_total = sum((Decimal(i.quantity) for i in eligible), Decimal(0))
    gross = sum((Decimal(i.line_total) for i in eligible), Decimal(0)) * data.quantity / received_total
    amount = (gross * Decimal(po.total) / Decimal(po.subtotal)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if Decimal(po.subtotal) else Decimal(0)
    obj = PurchaseReturn(
        tenant_id=tenant_id,
        reference=reference,
        purchase_order_id=data.purchase_order_id,
        product_id=data.product_id,
        variant_id=data.variant_id,
        product_name=data.product_name,
        quantity=data.quantity,
        amount=amount,
        base_amount=(amount * document_rate(po)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        currency_code=po.currency_code,
        client_reference=data.client_reference,
        reason=data.reason,
        return_date=data.return_date or datetime.now(UTC).date(),
        processed_by=user_id,
        status="Processing",
    )
    await repo.save(obj)
    from app.modules.accounting.service.transaction import create_supplier_return_transaction
    await create_supplier_return_transaction(db, tenant_id, user_id, obj, po.branch_id, "create")
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user_id, action="purchase_return.create",
        entity_type="purchase", entity_id=str(po.id), summary=f"Returned goods: {reference}",
        changes={"quantity": str(data.quantity), "stock_units": str(delta), "reason": data.reason})
    await db.flush()
    obj = await repo.get_by_id_for_tenant(tenant_id, obj.id)
    return _to_read(obj)


async def mark_refunded(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id=None, data=None) -> PurchaseReturnRead:
    from app.modules.accounting.repository.reporting import ReportingRepository
    from app.modules.accounting.service.transaction import create_supplier_return_transaction
    from app.modules.audit.service import record_audit
    from app.modules.currency.service import get_base_currency
    await ReportingRepository(db).lock_tenant(tenant_id)
    repo = PurchaseReturnRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Return not found")
    from app.modules.procurement.service.purchase import _require_purchase_actor
    if user_id is None:
        raise ValidationError("A refund actor is required")
    await _require_purchase_actor(db, tenant_id, user_id, "update", obj.purchase_order.branch_id)
    from app.modules.procurement.repository.pricing import PurchasePricingRepository
    actor = await PurchasePricingRepository(db).actor(tenant_id, user_id)
    if not actor.is_superuser and "accounts_payable:create" not in actor.permissions_names:
        raise ValidationError("Accounts payable create permission is required for a refund")
    if data is None or obj.base_amount is None:
        raise ValidationError("Record the actual base-currency refund amount, method and reference; reconcile historical returns in Accounting")
    if obj.status == "Refunded":
        if obj.refund_base_amount != data.base_amount:
            raise ValidationError("This refund was already recorded with a different amount")
        return _to_read(obj)
    if obj.status != "Processing":
        raise ValidationError("Only an unsettled return can be refunded")
    base = await get_base_currency(db, tenant_id)
    if (obj.currency_code or base) == base and data.base_amount != obj.base_amount:
        raise ValidationError("The refund must equal the carrying value for a base-currency return")
    await create_supplier_return_transaction(db, tenant_id, user_id, obj,
        obj.purchase_order.branch_id, "refund", data.base_amount, data.payment_method)
    obj.status, obj.refund_base_amount = "Refunded", data.base_amount
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user_id, action="purchase_return.refund",
        entity_type="purchase", entity_id=str(obj.purchase_order_id), summary=f"Recorded supplier refund {obj.reference}",
        changes={"reference": data.reference, "method": data.payment_method, "base_amount": str(data.base_amount)})
    await db.commit()
    return _to_read(obj)


async def mark_replaced(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id=None) -> PurchaseReturnRead:
    return await _restore_return(db, tenant_id, id, "Replaced", user_id)


async def _restore_return(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, target_status: str, user_id=None) -> PurchaseReturnRead:
    from app.modules.accounting.repository.reporting import ReportingRepository
    from app.modules.audit.service import record_audit
    await ReportingRepository(db).lock_tenant(tenant_id)
    repo = PurchaseReturnRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Return not found")
    if obj.status == target_status:
        return _to_read(obj)
    if obj.status != "Processing":
        raise ValidationError("Only returns still Processing can be deleted")
    from app.modules.procurement.repository.pricing import PurchasePricingRepository
    products, variants = await PurchasePricingRepository(db).catalog(tenant_id, [obj])
    product = products.get(obj.product_id)
    target = variants.get(obj.variant_id) if obj.variant_id else product
    if product is None or target is None:
        raise ValidationError("Purchase product is no longer available")
    lines = [i for i in obj.purchase_order.items if i.product_id == obj.product_id and i.variant_id == obj.variant_id]
    factor = next((Decimal(i.stock_factor) for i in lines if i.stock_factor is not None), Decimal(str(product.conversion_factor)))
    target.stock = Decimal(str(target.stock)) + Decimal(obj.quantity) * factor
    from app.modules.accounting.service.transaction import create_supplier_return_transaction
    await create_supplier_return_transaction(db, tenant_id, user_id, obj, obj.purchase_order.branch_id, target_status.lower())
    obj.status = target_status
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user_id, action="purchase_return.restore",
        entity_type="purchase", entity_id=str(obj.purchase_order_id), summary=f"{target_status} return {obj.reference}")
    await db.commit()

    return _to_read(obj)


async def delete_return(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id=None) -> None:
    await _restore_return(db, tenant_id, id, "Cancelled", user_id)


async def create_return(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID,
                        data: PurchaseReturnCreate) -> PurchaseReturnRead:
    async with db.begin_nested():
        result = await _create_return(db, tenant_id, user_id, data)
    await db.commit()
    return result
