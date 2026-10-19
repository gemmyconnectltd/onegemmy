"""Expense workspace integration uses rollback-only DB fixtures and temporary private files."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest
from pydantic import ValidationError as SchemaError
from sqlalchemy import select

from app.core.config import settings
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.modules.accounting.models.account import Account
from app.modules.accounting.models.expense import Expense
from app.modules.accounting.models.transaction import Transaction
from app.modules.accounting.models.transaction_line import TransactionLine
from app.modules.accounting.schemas.expense import ExpenseCreate, ExpenseUpdate
from app.modules.accounting.schemas.expense_workspace import ExpenseCategoryInput, ExpenseFilters
from app.modules.accounting.service import expense_workspace as workspace
from app.modules.accounting.service.account import seed_default_accounts
from app.modules.tenants.models import Branch, Tenant, User


@pytest.fixture
async def data(db):
    tenant = Tenant(name="Expense test", slug=uuid.uuid4().hex, currency="USD")
    db.add(tenant)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        email=f"{uuid.uuid4().hex}@example.test",
        full_name="Expense tester",
        role="owner",
        hashed_password="x",
        is_superuser=True,
    )
    branch = Branch(tenant_id=tenant.id, name="Expense branch")
    other = Branch(tenant_id=tenant.id, name="Other branch")
    db.add_all([user, branch, other])
    await db.flush()
    await seed_default_accounts(db, tenant.id)
    return tenant, user, branch, other


def payload(**overrides):
    return ExpenseCreate(
        **{
            "title": "Test expense",
            "amount": "25.50",
            "expense_date": datetime.now(UTC).date() - timedelta(days=1),
            "category": "Utilities",
            "payment_method": "Bank Transfer",
            "client_reference": uuid.uuid4().hex,
            **overrides,
        }
    )


def test_validation():
    for amount in ("0", "-1", "1.001"):
        with pytest.raises(SchemaError):
            payload(amount=amount)
    with pytest.raises(SchemaError):
        ExpenseFilters(from_date="2026-10-20", to_date="2026-10-01")


@pytest.mark.db
async def test_expense_retry_edit_approval_routes_payment_once_and_audits(db, data):
    tenant, user, branch, _ = data
    request = payload()
    created = await workspace.create(db, user, branch.id, request)
    retry = await workspace.create(db, user, branch.id, request)
    assert retry.id == created.id
    with pytest.raises(ConflictError):
        await workspace.create(db, user, branch.id, request.model_copy(update={"title": "Changed"}))
    edited = await workspace.edit(
        db, user, branch.id, created.id, ExpenseUpdate(amount="30.25", reference_number="BANK-123")
    )
    assert Decimal(str(edited.amount)) == Decimal("30.25")
    approved = await workspace.act(db, user, branch.id, created.id, "approve")
    assert approved.status == "Approved"
    with pytest.raises(ValidationError):
        await workspace.act(db, user, branch.id, created.id, "approve")
    txn = (
        await db.execute(
            select(Transaction).where(
                Transaction.tenant_id == tenant.id, Transaction.type == "expense"
            )
        )
    ).scalar_one()
    assert txn.branch_id == branch.id
    assert txn.transaction_date == request.expense_date
    code, amount = (
        await db.execute(
            select(Account.code, TransactionLine.amount)
            .join(TransactionLine, TransactionLine.account_id == Account.id)
            .where(
                TransactionLine.transaction_id == txn.id,
                TransactionLine.type == "credit",
                Account.tenant_id == tenant.id,
            )
        )
    ).one()
    assert code == "1010" and amount == Decimal("30.25")
    detail = await workspace.detail(db, user, branch.id, created.id)
    assert detail["history_total"] == 3
    with pytest.raises(ValidationError):
        await workspace.edit(db, user, branch.id, created.id, ExpenseUpdate(title="After posting"))


@pytest.mark.db
async def test_expense_full_period_totals_filters_and_scope(db, data):
    tenant, user, branch, other = data
    day = datetime.now(UTC).date()
    for index in range(61):
        db.add(
            Expense(
                tenant_id=tenant.id,
                reference=f"TEST-{index}",
                title="Power",
                amount=Decimal("1.25"),
                base_amount=Decimal("1.25"),
                expense_date=day,
                category="Utilities",
                payment_method="Mobile Money",
                branch_id=branch.id,
            )
        )
    db.add(
        Expense(
            tenant_id=tenant.id,
            reference="OTHER",
            title="Other",
            amount=99,
            base_amount=99,
            expense_date=day,
            category="Rent",
            branch_id=other.id,
        )
    )
    await db.flush()
    filters = ExpenseFilters(
        category="Utilities", payment_method="Mobile Money", from_date=day, to_date=day
    )
    result = await workspace.page(db, user, branch.id, filters, 2, 25)
    assert result["total"] == 61 and len(result["items"]) == 25
    overview = await workspace.page(db, user, branch.id, filters, 1, 5, True)
    assert overview["summary"]["count"] == 61
    assert Decimal(overview["summary"]["total"]) == Decimal("76.25")
    assert len(overview["items"]) == 5
    identity = uuid.UUID(result["items"][0]["id"])
    with pytest.raises(NotFoundError):
        await workspace.detail(db, user, other.id, identity)
    stranger = SimpleNamespace(tenant_id=uuid.uuid4(), is_superuser=True, branch_id=None)
    with pytest.raises(NotFoundError):
        await workspace.detail(db, stranger, None, identity)
    restricted = SimpleNamespace(
        tenant_id=tenant.id, is_superuser=False, branch_id=branch.id, permissions_names=[]
    )
    with pytest.raises(ForbiddenError):
        await workspace.detail(db, restricted, None, identity)


@pytest.mark.db
async def test_categories_rename_archive_and_private_receipts(db, data, tmp_path, monkeypatch):
    _tenant, user, branch, other = data
    monkeypatch.setattr(settings, "EXPENSE_RECEIPT_DIR", str(tmp_path))
    created = await workspace.create(db, user, branch.id, payload())
    categories = await workspace.categories(db, user, 1, "Utilities")
    identity = uuid.UUID(categories["items"][0]["id"])
    await workspace.save_category(
        db, user, ExpenseCategoryInput(name="Power", description="Electricity"), identity
    )
    assert (await workspace.detail(db, user, branch.id, created.id))["record"][
        "category"
    ] == "Power"
    with pytest.raises(ConflictError):
        await workspace.save_category(db, user, ExpenseCategoryInput(name="power"))
    await workspace.save_category(
        db, user, ExpenseCategoryInput(name="Power", is_active=False), identity
    )
    with pytest.raises(ValidationError):
        await workspace.create(db, user, branch.id, payload(category="Power"))
    with pytest.raises(ValidationError):
        await workspace.attach(db, user, branch.id, created.id, b"<svg>no</svg>", "test.svg")
    await workspace.attach(db, user, branch.id, created.id, b"%PDF-1.7\ntest", "receipt.pdf")
    path, name, kind = await workspace.receipt(db, user, branch.id, created.id)
    assert path.is_file() and name == "receipt.pdf" and kind == "application/pdf"
    assert "uploads" not in str(path)
    with pytest.raises(NotFoundError):
        await workspace.receipt(db, user, other.id, created.id)
    detail = await workspace.detail(db, user, branch.id, created.id)
    assert detail["record"]["receipt_name"] == "receipt.pdf"
    assert "receipt_key" not in detail["record"]
