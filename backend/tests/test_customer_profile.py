"""Customer 360: one call returns contact, sales, payments, returns and debts, each gated by its own permission."""
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.core.exceptions import ForbiddenError, NotFoundError
from app.modules.accounting.schemas.debt import DebtPaymentRequest
from app.modules.accounting.service import debt
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.return_ import Return
from app.modules.sales.service import customer_profile
from tests.test_debt_workspace import debt_data  # noqa: F401


@pytest.mark.db
async def test_profile_shows_everything_for_one_customer(db, debt_data):  # noqa: F811
    tenant, owner, branch, other, order, _ = debt_data
    await debt.pay(db, owner, "receivable", order.id, branch.id, DebtPaymentRequest(
        amount="40.00", payment_method="Cash", paid_at=datetime.now(UTC) - timedelta(hours=1), client_payment_id="prof-1"))
    db.add(Return(tenant_id=tenant.id, return_number="RET-1", refund_amount=15, status="Completed", return_date=datetime.now(UTC).date(),
                  order_id=order.id, customer_id=order.customer_id, currency_code="USD", exchange_rate=1))
    await db.flush()
    data = await customer_profile.profile(db, owner, branch.id, order.customer_id)
    assert data["customer"]["name"] == "Debt customer"
    assert data["summary"]["outstanding"] == "60.00" and data["summary"]["overdue"] == "60.00"
    assert data["summary"]["completed_orders"] == 1 and data["summary"]["returns"] == 1
    sections = data["sections"]
    assert [sections[k]["total"] for k in ("orders", "payments", "returns", "debts")] == [1, 1, 1, 1]
    assert sections["debts"]["items"][0]["outstanding"] == "60.00"
    # branch scoping: another branch has no sales or debts for this customer, but the returns/contact stay visible
    elsewhere = await customer_profile.profile(db, owner, other.id, order.customer_id)
    assert elsewhere["sections"]["orders"]["total"] == 0 and elsewhere["sections"]["debts"]["total"] == 0


@pytest.mark.db
async def test_profile_sections_follow_permissions_and_tenant(db, debt_data):  # noqa: F811
    tenant, _, _, _, order, _ = debt_data
    limited = SimpleNamespace(tenant_id=tenant.id, branch_id=None, is_superuser=False, permissions_names=["contacts:read", "returns:read"])
    data = await customer_profile.profile(db, limited, None, order.customer_id)
    assert data["customer"] and data["sections"]["returns"] is not None
    assert data["sections"]["orders"] is None and data["sections"]["payments"] is None and data["sections"]["debts"] is None
    with pytest.raises(ForbiddenError):
        await customer_profile.section(db, limited, None, order.customer_id, "orders", 1, 25)
    nobody = SimpleNamespace(tenant_id=tenant.id, branch_id=None, is_superuser=False, permissions_names=["orders:read"])
    assert (await customer_profile.profile(db, nobody, None, order.customer_id))["customer"] is None
    stranger = SimpleNamespace(tenant_id=uuid.uuid4(), branch_id=None, is_superuser=True, permissions_names=[])
    with pytest.raises(NotFoundError):
        await customer_profile.profile(db, stranger, None, order.customer_id)
    assert isinstance(Customer, type)
