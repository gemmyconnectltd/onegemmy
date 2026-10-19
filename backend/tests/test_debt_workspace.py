"""Debt integration tests use the shared rollback-only database fixture."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest
from pydantic import ValidationError as SchemaError
from sqlalchemy import select

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.modules.accounting.models.account import Account
from app.modules.accounting.models.transaction import Transaction
from app.modules.accounting.models.transaction_line import TransactionLine
from app.modules.accounting.schemas.debt import DebtFilters, DebtPaymentRequest
from app.modules.accounting.service import debt
from app.modules.accounting.service.account import seed_default_accounts
from app.modules.inventory.models.supplier import Supplier
from app.modules.procurement.models.purchase_order import PurchaseOrder
from app.modules.procurement.models.supplier_bill import SupplierBill
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.order import Order
from app.modules.tenants.models import Branch, Tenant, User


def test_debt_contract_rejects_reversed_date_range_and_invalid_amounts():
    with pytest.raises(SchemaError):
        DebtFilters(due_from="2026-10-20", due_to="2026-10-01")
    for amount in ["0", "-1", "0.001"]:
        with pytest.raises(SchemaError):
            DebtPaymentRequest(
                amount=amount,
                payment_method="Cash",
                paid_at=datetime.now(UTC),
                client_payment_id="test-key",
            )


@pytest.fixture
async def debt_data(db):
    tenant = Tenant(name="Debt test", slug=uuid.uuid4().hex, currency="USD")
    db.add(tenant)
    await db.flush()
    owner = User(
        tenant_id=tenant.id,
        email=f"{uuid.uuid4().hex}@example.test",
        full_name="Debt tester",
        role="owner",
        is_superuser=True,
        hashed_password="x",
    )
    branch = Branch(tenant_id=tenant.id, name="Debt branch")
    other = Branch(tenant_id=tenant.id, name="Other branch")
    customer = Customer(tenant_id=tenant.id, name="Debt customer")
    supplier = Supplier(tenant_id=tenant.id, name="Debt supplier")
    db.add_all([owner, branch, other, customer, supplier])
    await db.flush()
    await seed_default_accounts(db, tenant.id)
    now = datetime.now(UTC)
    order = Order(
        tenant_id=tenant.id,
        order_number="DEBT-ORDER",
        status="Completed",
        total=100,
        subtotal=100,
        tax=0,
        amount_paid=0,
        credit_base=100,
        customer_id=customer.id,
        branch_id=branch.id,
        ordered_at=now - timedelta(days=3),
        due_date=now.date() - timedelta(days=1),
        currency_code="USD",
        exchange_rate=1,
    )
    purchase = PurchaseOrder(
        tenant_id=tenant.id,
        reference="DEBT-PURCHASE",
        status="Received",
        subtotal=100,
        total=100,
        supplier_id=supplier.id,
        branch_id=branch.id,
        currency_code="USD",
        exchange_rate=1,
    )
    db.add_all([order, purchase])
    await db.flush()
    bill = SupplierBill(
        tenant_id=tenant.id,
        reference="DEBT-BILL",
        purchase_order_id=purchase.id,
        supplier_id=supplier.id,
        amount=100,
        amount_paid=0,
        status="Unpaid",
        bill_date=now.date() - timedelta(days=3),
        due_date=now.date() + timedelta(days=2),
        currency_code="USD",
        exchange_rate=1,
    )
    db.add(bill)
    await db.flush()
    return tenant, owner, branch, other, order, bill


@pytest.mark.db
async def test_debt_lists_and_totals_are_bounded_filtered_and_branch_scoped(db, debt_data):
    tenant, owner, branch, other, order, _ = debt_data
    for index in range(60):
        db.add(
            Order(
                tenant_id=tenant.id,
                order_number=f"DEBT-{index:03}",
                status="Completed",
                total=100,
                amount_paid=0,
                credit_base=100,
                branch_id=branch.id,
                currency_code="USD",
                exchange_rate=1,
            )
        )
    await db.flush()
    first = await debt.records(db, owner, "receivable", branch.id, DebtFilters(), 1, 25)
    last = await debt.records(db, owner, "receivable", branch.id, DebtFilters(), 3, 25)
    assert first["total"] == 61 and len(first["items"]) == 25 and len(last["items"]) == 11
    assert first["summary"]["outstanding"] == last["summary"]["outstanding"] == "6100.00"
    filtered = await debt.records(
        db,
        owner,
        "receivable",
        branch.id,
        DebtFilters(status="Overdue", search="DEBT-ORDER"),
        1,
        25,
    )
    assert filtered["total"] == 1 and filtered["items"][0]["id"] == str(order.id)
    assert (await debt.records(db, owner, "receivable", other.id, DebtFilters(), 1, 25))[
        "total"
    ] == 0
    summary = await debt.overview(db, owner, branch.id)
    assert summary["totals"]["payable"]["outstanding"] == "100.00"
    assert len(summary["items"]) == 2


@pytest.mark.db
async def test_debt_detail_enforces_tenant_branch_and_read_permission(db, debt_data):
    tenant, owner, branch, other, order, _ = debt_data
    with pytest.raises(NotFoundError):
        await debt.detail(db, owner, "receivable", order.id, other.id, 1)
    restricted = SimpleNamespace(
        tenant_id=tenant.id,
        branch_id=branch.id,
        is_superuser=False,
        permissions_names=["accounts_receivable:read"],
    )
    with pytest.raises(ForbiddenError):
        await debt.records(db, restricted, "receivable", other.id, DebtFilters(), 1, 25)
    with pytest.raises(ForbiddenError):
        await debt.records(db, restricted, "payable", branch.id, DebtFilters(), 1, 25)
    result = await debt.overview(db, restricted, branch.id)
    assert result["totals"]["payable"] is None
    restricted.tenant_id = uuid.uuid4()
    restricted.branch_id = None
    with pytest.raises(NotFoundError):
        await debt.detail(db, restricted, "receivable", order.id, None, 1)


@pytest.mark.db
async def test_receivable_payment_retry_partial_full_and_overpayment(db, debt_data):
    _, owner, branch, _, order, _ = debt_data
    data = DebtPaymentRequest(
        amount="25.00",
        payment_method="Cash",
        paid_at=datetime.now(UTC) - timedelta(days=1),
        client_payment_id="debt-retry",
        notes="First installment",
    )
    first = await debt.pay(db, owner, "receivable", order.id, branch.id, data)
    again = await debt.pay(db, owner, "receivable", order.id, branch.id, data)
    assert first["record"]["outstanding"] == again["record"]["outstanding"] == "75.00"
    assert again["record"]["status"] == "PartiallyPaid" and again["record"]["is_overdue"]
    assert again["payment_total"] == 1
    txn = (
        await db.execute(
            select(Transaction).where(
                Transaction.tenant_id == owner.tenant_id, Transaction.type == "customer_payment"
            )
        )
    ).scalar_one()
    assert txn.branch_id == branch.id and txn.transaction_date == data.paid_at.date()
    with pytest.raises(ConflictError):
        await debt.pay(
            db,
            owner,
            "receivable",
            order.id,
            branch.id,
            data.model_copy(update={"amount": Decimal(26)}),
        )
    with pytest.raises(ValidationError):
        await debt.pay(
            db,
            owner,
            "receivable",
            order.id,
            branch.id,
            data.model_copy(update={"amount": Decimal(76), "client_payment_id": "new-key"}),
        )
    final = await debt.pay(
        db,
        owner,
        "receivable",
        order.id,
        branch.id,
        data.model_copy(update={"amount": Decimal(75), "client_payment_id": "final-key"}),
    )
    assert final["record"]["status"] == "Paid" and final["record"]["outstanding"] == "0.00"


@pytest.mark.db
@pytest.mark.parametrize("method, cash_code", [("Bank Transfer", "1010"), ("Mobile Money", "1020")])
async def test_supplier_payment_metadata_date_and_history_are_audited_once(
    db, debt_data, method, cash_code
):
    _, owner, branch, _, _, bill = debt_data
    paid_at = datetime.now(UTC).replace(hour=12) - timedelta(days=1)
    data = DebtPaymentRequest(
        amount="40.00",
        payment_method=method,
        paid_at=paid_at,
        client_payment_id="supplier-retry",
        reference_number="BANK-42",
        notes="First supplier installment",
    )
    first = await debt.pay(db, owner, "payable", bill.id, branch.id, data)
    again = await debt.pay(db, owner, "payable", bill.id, branch.id, data)
    assert first["record"]["outstanding"] == again["record"]["outstanding"] == "60.00"
    assert again["payment_total"] == 1
    assert again["payments"][0]["notes"] == data.notes
    assert again["payments"][0]["reference_number"] == "BANK-42"
    assert again["payments"][0]["reference"].startswith("DEBT-")
    assert again["payments"][0]["display_reference"] == "Payment 1"
    txn = (
        await db.execute(
            select(Transaction).where(
                Transaction.tenant_id == owner.tenant_id, Transaction.type == "supplier_payment"
            )
        )
    ).scalar_one()
    assert txn.transaction_date == paid_at.date()
    assert txn.branch_id == branch.id
    posted_cash_code = await db.scalar(
        select(Account.code)
        .join(TransactionLine, TransactionLine.account_id == Account.id)
        .where(TransactionLine.transaction_id == txn.id, TransactionLine.type == "credit")
    )
    assert posted_cash_code == cash_code
    with pytest.raises(ConflictError):
        await debt.pay(
            db,
            owner,
            "payable",
            bill.id,
            branch.id,
            data.model_copy(update={"notes": "Changed instructions"}),
        )


@pytest.mark.db
async def test_payable_receipt_scopes_drafts_and_opens_bill_without_duplicate_stock(db, debt_data):
    from app.modules.inventory.models.product import Product
    from app.modules.procurement.models.purchase_item import PurchaseItem

    tenant, owner, branch, other, _, existing_bill = debt_data
    product = Product(tenant_id=tenant.id, name="Receipt test", stock=0, cost=10, price=20)
    purchase = PurchaseOrder(tenant_id=tenant.id, reference="RECEIPT-TEST", status="Draft",
                             branch_id=branch.id, supplier_id=existing_bill.supplier_id,
                             subtotal=100, total=100, currency_code="USD", exchange_rate=1)
    db.add_all([product, purchase])
    await db.flush()
    db.add(PurchaseItem(purchase_order_id=purchase.id, product_id=product.id,
                       product_name="Receipt test", unit_cost=10, quantity=10, line_total=100))
    await db.flush()
    drafts = await debt.draft_purchases(db, owner, branch.id, 1, 25)
    assert drafts["total"] == 1
    assert str(drafts["items"][0]["id"]) == str(purchase.id)
    assert (await debt.draft_purchases(db, owner, other.id, 1, 25))["total"] == 0
    due = datetime.now(UTC).date() + timedelta(days=7)
    with pytest.raises(NotFoundError):
        await debt.receive_payable(db, owner, other.id, purchase.id, due)
    result = await debt.receive_payable(db, owner, branch.id, purchase.id, due)
    assert Decimal(result["record"]["outstanding"]) == 100
    assert result["record"]["due_date"] == due.isoformat()
    await db.refresh(product)
    assert product.stock == 10
    again = await debt.receive_payable(db, owner, branch.id, purchase.id, due)
    assert again["record"]["id"] == result["record"]["id"]
    await db.refresh(product)
    assert product.stock == 10
    assert (await debt.draft_purchases(db, owner, branch.id, 1, 25))["total"] == 0
    bill_id = uuid.UUID(result["record"]["id"])
    for index, amount in enumerate(("25", "75")):
        settled = await debt.pay(db, owner, "payable", bill_id, branch.id, DebtPaymentRequest(
            amount=amount, payment_method="Bank Transfer", paid_at=datetime.now(UTC),
            client_payment_id=f"receipt-payment-{index}",
        ))
        assert Decimal(settled["record"]["outstanding"]) == (75 if index == 0 else 0)
    assert settled["record"]["status"] == "Paid"
    assert settled["payment_total"] == 2
    assert {p["display_reference"] for p in settled["payments"]} == {"Payment 1", "Payment 2"}
    stranger = SimpleNamespace(tenant_id=uuid.uuid4(), is_superuser=True, branch_id=None)
    with pytest.raises(NotFoundError):
        await debt.receive_payable(db, stranger, None, purchase.id, due)
    restricted = SimpleNamespace(tenant_id=tenant.id, is_superuser=False, branch_id=branch.id,
                                 permissions_names=["accounts_payable:read"])
    with pytest.raises(ForbiddenError):
        await debt.receive_payable(db, restricted, None, purchase.id, due)
