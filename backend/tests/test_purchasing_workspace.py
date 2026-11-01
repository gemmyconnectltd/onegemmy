"""Purchasing receipt correctness and isolation regressions."""
import uuid
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from pydantic import ValidationError as SchemaError
from sqlalchemy import func, select

from app.core.access import decide
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.procurement.models import GoodsReceipt, SupplierBill
from app.modules.procurement.schemas.purchase import (
    PurchaseCreate,
    PurchaseItemCreate,
    ReceiptCreate,
)
from app.modules.procurement.schemas.purchase_return import PurchaseReturnCreate
from app.modules.procurement.schemas.supplier_bill import SupplierPaymentCreate
from app.modules.procurement.service import purchase, purchase_return
from app.modules.procurement.service.supplier_bill import record_payment
from tests.test_purchase_pricing import context  # noqa: F401


def test_purchase_creation_cannot_post_stock_or_bypass_approval_status():
    with pytest.raises(SchemaError):
        PurchaseCreate(status="Received", items=[PurchaseItemCreate(
            product_name="Test", unit_cost="10", quantity="1")])
    with pytest.raises(SchemaError):
        PurchaseCreate(status="PendingApproval", items=[PurchaseItemCreate(
            product_name="Test", unit_cost="10", quantity="1")])


def test_receipt_permissions_do_not_allow_an_unrelated_module_writer():
    path = "/procurement/purchase-orders/abc/receipts"
    assert not decide("procurement", "POST", path, ["vendors:create"])[0]
    assert decide("procurement", "POST", path, ["purchase_orders:update"])[0]
    assert not decide("procurement", "POST", "/procurement/purchase-orders/abc/actions/approve", ["purchase_orders:update"])[0]
    assert decide("procurement", "POST", "/procurement/purchase-orders/abc/actions/approve", ["purchase_orders:approve"])[0]


@pytest.mark.db
async def test_partial_receipts_retry_billing_and_returns(db, context):  # noqa: F811
    tenant, actor, _member, supplier, branch, product = context
    data = PurchaseCreate(client_reference=uuid.uuid4().hex, supplier_id=supplier.id,
        order_date=datetime.now(UTC).date(), payment_terms_days=7,
        items=[PurchaseItemCreate(product_id=product.id, product_name=product.name,
                                  quantity="10", unit_cost="12.50")])
    order = await purchase.create_purchase(db, tenant.id, actor.id, data, branch.id)
    assert (await purchase.create_purchase(db, tenant.id, actor.id, data, branch.id)).id == order.id
    await db.refresh(product)
    assert product.stock == 5
    await purchase.transition_purchase(db, tenant.id, order.id, actor.id, "submit")
    await purchase.transition_purchase(db, tenant.id, order.id, actor.id, "approve")
    item_id = order.items[0].id
    first = ReceiptCreate(client_reference=uuid.uuid4().hex,
        lines=[{"purchase_item_id": item_id, "quantity": "6"}])
    from datetime import timedelta
    with pytest.raises(ValidationError):
        await purchase.confirm_receipt(db, tenant.id, order.id, actor.id,
            first.model_copy(update={"client_reference": uuid.uuid4().hex,
                "due_date": datetime.now(UTC).date() - timedelta(days=1)}))
    await db.refresh(product)
    assert product.stock == 5
    assert await db.scalar(select(func.count()).select_from(GoodsReceipt).where(GoodsReceipt.tenant_id == tenant.id)) == 0
    partial = await purchase.confirm_receipt(db, tenant.id, order.id, actor.id, first)
    assert partial.status == "PartiallyReceived"
    assert partial.items[0].received_quantity == Decimal(6)
    await db.refresh(product)
    assert product.stock == 11
    await purchase.confirm_receipt(db, tenant.id, order.id, actor.id, first)
    await db.refresh(product)
    assert product.stock == 11
    with pytest.raises(ConflictError):
        await purchase.confirm_receipt(db, tenant.id, order.id, actor.id,
            first.model_copy(update={"lines": [first.lines[0].model_copy(update={"quantity": Decimal(5)})]}))
    with pytest.raises(ValidationError):
        await purchase.confirm_receipt(db, tenant.id, order.id, actor.id,
            ReceiptCreate(client_reference=uuid.uuid4().hex,
                lines=[{"purchase_item_id": item_id, "quantity": "5"}]))
    final = await purchase.confirm_receipt(db, tenant.id, order.id, actor.id,
        ReceiptCreate(client_reference=uuid.uuid4().hex,
            lines=[{"purchase_item_id": item_id, "quantity": "4"}]))
    assert final.status == "Received"
    await db.refresh(product)
    assert product.stock == 15
    assert await db.scalar(select(func.count()).select_from(GoodsReceipt).where(GoodsReceipt.tenant_id == tenant.id)) == 2
    bills = list(await db.scalars(select(SupplierBill).where(SupplierBill.tenant_id == tenant.id)))
    assert sorted(Decimal(b.amount) for b in bills) == [Decimal(50), Decimal(75)]
    assert all(b.status == "Unpaid" and b.amount_paid == 0 for b in bills)
    with pytest.raises(ValidationError):
        await purchase.transition_purchase(db, tenant.id, order.id, actor.id, "close")
    for bill in bills:
        part = SupplierPaymentCreate(amount=Decimal(bill.amount) / 2, payment_method="Cash", client_reference=uuid.uuid4().hex)
        paid = await record_payment(db, tenant.id, actor.id, bill.id, part, actor)
        assert paid.status == "PartiallyPaid"
        assert (await record_payment(db, tenant.id, actor.id, bill.id, part, actor)).balance == paid.balance
        final_payment = SupplierPaymentCreate(amount=Decimal(str(paid.balance)), payment_method="Cash", client_reference=uuid.uuid4().hex)
        assert (await record_payment(db, tenant.id, actor.id, bill.id, final_payment, actor)).status == "Paid"
    assert (await purchase.transition_purchase(db, tenant.id, order.id, actor.id, "close")).status == "Closed"
    with pytest.raises(NotFoundError):
        await purchase.confirm_receipt(db, uuid.uuid4(), order.id, actor.id, first)
    returned = PurchaseReturnCreate(purchase_order_id=order.id, client_reference=uuid.uuid4().hex,
        product_id=product.id, product_name=product.name, quantity="2", reason="Damaged items")
    result = await purchase_return.create_return(db, tenant.id, actor.id, returned)
    await purchase_return.create_return(db, tenant.id, actor.id, returned)
    await db.refresh(product)
    assert product.stock == 13
    with pytest.raises(ValidationError):
        await purchase_return.create_return(db, tenant.id, actor.id,
            returned.model_copy(update={"client_reference": uuid.uuid4().hex, "quantity": Decimal(9)}))
    with pytest.raises(ValidationError):
        await purchase_return.create_return(db, tenant.id, actor.id,
            returned.model_copy(update={"client_reference": uuid.uuid4().hex, "product_id": uuid.uuid4()}))
    await purchase_return.delete_return(db, tenant.id, result.id)
    await db.refresh(product)
    assert product.stock == 15
    assert (await purchase_return.get_return(db, tenant.id, result.id)).status == "Cancelled"


@pytest.mark.db
async def test_service_receipt_posts_expense_and_leaves_stock_unchanged(db, context):  # noqa: F811
    from app.modules.accounting.models.account import Account
    from app.modules.accounting.models.transaction import Transaction
    from app.modules.accounting.models.transaction_line import TransactionLine
    tenant, actor, _member, supplier, branch, product = context
    expense = await db.scalar(select(Account).where(Account.tenant_id == tenant.id, Account.code == "5900"))
    order = await purchase.create_purchase(db, tenant.id, actor.id, PurchaseCreate(
        supplier_id=supplier.id, items=[PurchaseItemCreate(is_service=True, expense_account_id=expense.id,
            product_name="Equipment maintenance", quantity="1", unit_cost="118", tax_rate=18)]), branch.id)
    await purchase.receive_purchase(db, tenant.id, order.id, actor.id)
    await db.refresh(product)
    assert product.stock == 5
    debit = await db.scalar(select(func.sum(TransactionLine.amount)).join(Transaction, Transaction.id == TransactionLine.transaction_id)
        .where(Transaction.tenant_id == tenant.id, Transaction.purchase_id == order.id,
               TransactionLine.account_id == expense.id, TransactionLine.type == "debit"))
    assert debit == Decimal(118)
    assert (await purchase.get_purchase(db, tenant.id, order.id)).included_vat == Decimal(18)


async def test_private_uploads_cannot_be_served_publicly(tmp_path):
    from httpx import ASGITransport, AsyncClient
    from starlette.applications import Starlette
    from starlette.routing import Mount

    from app.integrations.storage.protected import PublicUploads
    (tmp_path / "private").mkdir()
    (tmp_path / "private" / "invoice.pdf").write_bytes(b"%PDF-test")
    (tmp_path / "logo.png").write_bytes(b"public-logo")
    app = Starlette(routes=[Mount("/uploads", PublicUploads(directory=str(tmp_path)))])
    async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as client:
        assert (await client.get("/uploads/private/invoice.pdf")).status_code == 404
        assert (await client.get("/uploads/logo.png")).status_code == 200


@pytest.mark.db
async def test_supplier_return_refund_and_replacement_settle_claim_once(db, context):  # noqa: F811
    from app.modules.accounting.models.account import Account
    from app.modules.accounting.models.transaction import Transaction
    from app.modules.accounting.models.transaction_line import TransactionLine
    from app.modules.procurement.schemas.purchase_return import SupplierRefundInput
    tenant, actor, _member, supplier, branch, product = context
    order = await purchase.create_purchase(db, tenant.id, actor.id, PurchaseCreate(
        supplier_id=supplier.id, items=[PurchaseItemCreate(product_id=product.id,
            product_name=product.name, quantity="10", unit_cost="10")]), branch.id)
    await purchase.receive_purchase(db, tenant.id, order.id, actor.id)
    returned = await purchase_return.create_return(db, tenant.id, actor.id, PurchaseReturnCreate(
        purchase_order_id=order.id, product_id=product.id, product_name=product.name,
        quantity="2", reason="Damaged goods", client_reference=uuid.uuid4().hex))
    refund = SupplierRefundInput(base_amount="20", payment_method="Cash", reference="Supplier refund 001")
    await purchase_return.mark_refunded(db, tenant.id, returned.id, actor.id, refund)
    await purchase_return.mark_refunded(db, tenant.id, returned.id, actor.id, refund)
    await db.refresh(product)
    assert product.stock == 13
    other = await purchase_return.create_return(db, tenant.id, actor.id, PurchaseReturnCreate(
        purchase_order_id=order.id, product_id=product.id, product_name=product.name,
        quantity="1", reason="Wrong product", client_reference=uuid.uuid4().hex))
    await purchase_return.mark_replaced(db, tenant.id, other.id, actor.id)
    await purchase_return.mark_replaced(db, tenant.id, other.id, actor.id)
    await db.refresh(product)
    assert product.stock == 13
    claims = await db.scalar(select(Account.id).where(Account.tenant_id == tenant.id, Account.code == "1190"))
    rows = list(await db.scalars(select(TransactionLine).join(Transaction, Transaction.id == TransactionLine.transaction_id)
        .where(Transaction.tenant_id == tenant.id, TransactionLine.account_id == claims)))
    assert sum((Decimal(line.amount) if line.type == "debit" else -Decimal(line.amount) for line in rows), Decimal(0)) == 0
    assert await db.scalar(select(func.count()).select_from(Transaction).where(Transaction.tenant_id == tenant.id, Transaction.type == "supplier_return")) == 4
