"""Debt Management: aging, statements, opening balances, write-off / void and the permission matrix."""

import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import func, select

from app.core.access import decide
from app.core.exceptions import ForbiddenError, ValidationError
from app.modules.accounting.schemas.debt import (
    DebtEditRequest,
    DebtFilters,
    DebtPaymentRequest,
    ManualDebtRequest,
)
from app.modules.accounting.service import debt, debt_actions
from app.modules.accounting.service.debt_statement import bucket_for, build_ledger, statement
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.order import Order
from tests.test_debt_workspace import debt_data  # noqa: F401  (shared fixture)

TODAY = datetime.now(UTC).date()


def pay_request(amount: str, key: str) -> DebtPaymentRequest:
    return DebtPaymentRequest(amount=amount, payment_method="Cash", paid_at=datetime.now(UTC) - timedelta(hours=1),
                              client_payment_id=key)


def test_bucket_edges():
    as_of = date(2026, 10, 26)
    ages = {0: "0-30", 30: "0-30", 31: "31-60", 60: "31-60", 61: "61-90", 90: "61-90", 91: "90+", 400: "90+"}
    for days, expected in ages.items():
        assert bucket_for(as_of - timedelta(days=days), as_of) == expected
    assert bucket_for(as_of + timedelta(days=5), as_of) == "0-30"  # not yet due


def test_ledger_running_balance_opening_and_closing():
    docs = [{"id": "a", "reference": "INV-1", "issue_date": date(2026, 1, 10), "original": "100.00", "outstanding": "40.00",
             "rate": Decimal(1), "age_ref": date(2026, 2, 10), "is_manual": False},
            {"id": "b", "reference": "INV-2", "issue_date": date(2026, 6, 1), "original": "50.00", "outstanding": "50.00",
             "rate": Decimal(1), "age_ref": date(2026, 6, 20), "is_manual": False}]
    payments = [{"doc": "a", "reference": "P1", "date": date(2026, 3, 1), "amount": Decimal("60.00"), "description": "Payment"}]
    ledger = build_ledger(docs, payments, [], date(2026, 2, 1), date(2026, 7, 1))
    assert ledger["opening"] == Decimal("100.00")
    assert [r["balance"] for r in ledger["rows"]] == [Decimal("40.00"), Decimal("90.00")]
    assert ledger["closing"] == Decimal("90.00") == ledger["opening"] + ledger["totals"]["billed"] - ledger["totals"]["paid"]
    assert sum(ledger["aging"].values()) == ledger["closing"]


@pytest.mark.db
async def test_aging_buckets_add_up_to_outstanding(db, debt_data):  # noqa: F811
    tenant, owner, branch, _, _, _ = debt_data
    for index, days in enumerate((5, 45, 75, 130)):
        db.add(Order(tenant_id=tenant.id, order_number=f"AGE-{index}", status="Completed", total=10, amount_paid=0, credit_base=10,
                     branch_id=branch.id, currency_code="USD", exchange_rate=1, due_date=TODAY - timedelta(days=days),
                     ordered_at=datetime.now(UTC) - timedelta(days=days + 1)))
    await db.flush()
    summary = (await debt.records(db, owner, "receivable", branch.id, DebtFilters(), 1, 25))["summary"]
    aging = summary["aging"]
    assert aging["31-60"] == aging["61-90"] == aging["90+"] == "10.00"
    assert Decimal(aging["0-30"]) == Decimal("110.00")  # the fixture's 1-day-late order (100) + 5 days late (10)
    assert sum(Decimal(v) for v in aging.values()) == Decimal(summary["outstanding"])


@pytest.mark.db
async def test_statement_reconciles_with_the_receivables_list(db, debt_data):  # noqa: F811
    _, owner, branch, _, order, _ = debt_data
    await debt.pay(db, owner, "receivable", order.id, branch.id, pay_request("30.00", "stmt-1"))
    data = await statement(db, owner, "receivable", branch.id, order.customer_id, None, None)
    listed = (await debt.records(db, owner, "receivable", branch.id, DebtFilters(), 1, 25))["summary"]["outstanding"]
    assert Decimal(data["closing"]) == Decimal(listed) == Decimal("70.00")
    assert Decimal(data["totals"]["billed"]) == Decimal("100.00") and Decimal(data["totals"]["paid"]) == Decimal("30.00")
    assert Decimal(data["rows"][-1]["balance"]) == Decimal(data["closing"])
    assert sum(Decimal(v) for v in data["aging"].values()) == Decimal(data["closing"])
    later = await statement(db, owner, "receivable", branch.id, order.customer_id, TODAY, TODAY)
    assert Decimal(later["opening"]) == Decimal("100.00") and Decimal(later["closing"]) == Decimal("70.00")
    assert [r["type"] for r in later["rows"]] == ["payment"]


def manual_request(party, branch=None, amount="200.00", **extra):
    return ManualDebtRequest(party_id=party, branch_id=branch, amount=amount, issue_date=TODAY - timedelta(days=40),
                             due_date=TODAY - timedelta(days=10), **extra)


@pytest.mark.db
async def test_manual_receivable_lifecycle_has_no_stock_or_sale(db, debt_data):  # noqa: F811
    _, owner, branch, _, order, _ = debt_data
    customer = order.customer_id
    orders_before = await db.scalar(select(func.count()).select_from(Order))
    with pytest.raises(ValidationError):  # All branches: the branch must be explicit
        await debt_actions.create_manual(db, owner, "receivable", None, manual_request(customer))
    created = await debt_actions.create_manual(db, owner, "receivable", branch.id, manual_request(customer))
    assert await db.scalar(select(func.count()).select_from(Order)) == orders_before
    record_id = uuid.UUID(created["id"])
    row = (await debt.detail(db, owner, "receivable", record_id, branch.id, 1))["record"]
    assert row["is_manual"] and row["outstanding"] == "200.00" and row["is_overdue"]
    with pytest.raises(ValidationError):
        await debt.pay(db, owner, "receivable", record_id, branch.id, pay_request("200.01", "m-over"))
    first = pay_request("50.00", "m-1")
    paid = await debt.pay(db, owner, "receivable", record_id, branch.id, first)
    assert paid["record"]["outstanding"] == "150.00" and paid["payment_total"] == 1
    again = await debt.pay(db, owner, "receivable", record_id, branch.id, first)  # idempotent retry
    assert again["payment_total"] == 1
    edited = await debt_actions.edit(db, owner, "receivable", record_id, branch.id, DebtEditRequest(due_date=TODAY + timedelta(days=5)))
    assert not edited["record"]["is_overdue"]
    with pytest.raises(ValidationError):  # has payments, so void is refused
        await debt_actions.void(db, owner, "receivable", record_id, branch.id, "entered twice")
    written = await debt_actions.write_off(db, owner, "receivable", record_id, branch.id, "Customer closed")
    assert written["record"]["outstanding"] == "0.00" and written["record"]["status"] == "WrittenOff"
    with pytest.raises(ValidationError):
        await debt_actions.write_off(db, owner, "receivable", record_id, branch.id, "again")
    second = uuid.UUID((await debt_actions.create_manual(db, owner, "receivable", branch.id, manual_request(customer, amount="10")))["id"])
    await debt_actions.void(db, owner, "receivable", second, branch.id, "entered twice")
    listed = await debt.records(db, owner, "receivable", branch.id, DebtFilters(), 1, 50)
    assert str(second) not in {item["id"] for item in listed["items"]}


@pytest.mark.db
async def test_native_sale_cannot_be_voided_but_can_be_written_off(db, debt_data):  # noqa: F811
    _, owner, branch, _, order, bill = debt_data
    with pytest.raises(ValidationError):
        await debt_actions.void(db, owner, "receivable", order.id, branch.id, "mistake")
    result = await debt_actions.write_off(db, owner, "payable", bill.id, branch.id, "Supplier forgave the balance")
    assert result["record"]["status"] == "WrittenOff"


@pytest.mark.db
async def test_manual_payable_and_unknown_party(db, debt_data):  # noqa: F811
    _, owner, branch, _, _, bill = debt_data
    created = await debt_actions.create_manual(db, owner, "payable", branch.id, manual_request(bill.supplier_id))
    row = (await debt.detail(db, owner, "payable", uuid.UUID(created["id"]), branch.id, 1))["record"]
    assert row["is_manual"] and row["kind"] == "payable"
    with pytest.raises(Exception, match="Supplier not found"):
        await debt_actions.create_manual(db, owner, "payable", branch.id, manual_request(uuid.uuid4()))
    customers = await db.scalar(select(func.count()).select_from(Customer))
    assert customers >= 1


# role -> permissions held; action -> (callable name, permission the service must require)
ROLES = {
    "reader": ["accounts_receivable:read"],
    "collector": ["accounts_receivable:read", "accounts_receivable:create"],
    "manager": ["accounts_receivable:read", "accounts_receivable:create", "accounts_receivable:update"],
    "admin": ["accounts_receivable:read", "accounts_receivable:create", "accounts_receivable:update", "accounts_receivable:delete"],
    "payables_only": ["accounts_payable:read", "accounts_payable:create", "accounts_payable:update", "accounts_payable:delete"],
}
ENDPOINTS = [  # (method, path, permission needed)
    ("POST", "/accounting/debts/receivable/search", None),
    ("POST", "/accounting/debts/receivable/manual", "accounts_receivable:create"),
    ("POST", "/accounting/debts/receivable/ID/payments", "accounts_receivable:create"),
    ("PATCH", "/accounting/debts/receivable/ID", "accounts_receivable:update"),
    ("POST", "/accounting/debts/receivable/ID/write-off", "accounts_receivable:update"),
    ("POST", "/accounting/debts/receivable/remind", "accounts_receivable:update"),
    ("DELETE", "/accounting/debts/receivable/ID", "accounts_receivable:delete"),
]


@pytest.mark.parametrize("role", ROLES)
def test_router_guard_matrix(role):
    held = ROLES[role]
    for method, path, needed in ENDPOINTS:
        allowed, _ = decide("accounting", method, path.removeprefix("/accounting"), held)
        write_actions_held = {p.split(":")[1] for p in held if p.startswith(("accounts_receivable", "accounts_payable"))}
        if method == "DELETE":
            assert allowed == ("delete" in write_actions_held), (role, method, path)
        elif method == "PATCH":
            assert allowed == ("update" in write_actions_held), (role, method, path)
        elif needed:
            assert allowed == bool(write_actions_held & {"create", "update", "approve"}), (role, method, path)


def staff(role):
    return SimpleNamespace(id=uuid.uuid4(), full_name=role, tenant_id=uuid.uuid4(), branch_id=None, is_superuser=False,
                           permissions_names=ROLES[role])


ACTIONS = {
    "manual": ("accounts_receivable:create", lambda u: debt_actions.create_manual(None, u, "receivable", None, manual_request(uuid.uuid4()))),
    "pay": ("accounts_receivable:create", lambda u: debt.pay(None, u, "receivable", uuid.uuid4(), None, pay_request("1", "key-1"))),
    "edit": ("accounts_receivable:update", lambda u: debt_actions.edit(None, u, "receivable", uuid.uuid4(), None, DebtEditRequest(notes="x"))),
    "write_off": ("accounts_receivable:update", lambda u: debt_actions.write_off(None, u, "receivable", uuid.uuid4(), None, "reason")),
    "void": ("accounts_receivable:delete", lambda u: debt_actions.void(None, u, "receivable", uuid.uuid4(), None, "reason")),
}


@pytest.mark.parametrize("role", ROLES)
@pytest.mark.parametrize("action", ACTIONS)
async def test_service_enforces_its_own_permission(role, action):
    needed, call = ACTIONS[action]
    user = staff(role)
    if needed in user.permissions_names:
        return  # the allowed path needs a database and is covered by the lifecycle tests above
    with pytest.raises(ForbiddenError):
        await call(user)
