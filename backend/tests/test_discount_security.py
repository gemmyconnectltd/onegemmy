"""Authorization at the HTTP boundary and approval context checks, without a database."""

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError as SchemaError

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.exceptions import ForbiddenError
from app.main import app
from app.modules.discounts import service
from app.modules.discounts.engine import Context, Line, price_cart
from app.modules.discounts.repository import DiscountRepository
from app.modules.discounts.schemas import PriceIn, RuleIn, SettingsIn


@pytest.mark.parametrize(
    ("method", "suffix"),
    [
        ("POST", "/rules"),
        ("PUT", "/rules/{id}"),
        ("POST", "/rules/{id}/status"),
        ("POST", "/campaigns"),
        ("PUT", "/campaigns/{id}"),
        ("POST", "/campaigns/{id}/status"),
        ("POST", "/coupons"),
        ("POST", "/coupons/{id}/status"),
        ("POST", "/approvals"),
        ("PATCH", "/settings"),
        ("POST", "/preview"), ("POST", "/catalog/preview"),
    ],
)
async def test_mutation_permissions_are_checked_before_invalid_body(monkeypatch, method, suffix):
    user = SimpleNamespace(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        is_superuser=False,
        role="unprivileged",
        permissions_names=[],
        role_permissions_names=[],
        branch_id=None,
        branch_ids=None,
        disabled_modules=[],
    )

    async def current():
        return user

    async def database():
        yield SimpleNamespace()

    from app.modules.tenants import service as tenant_service

    monkeypatch.setattr(tenant_service, "module_status", AsyncMock(return_value="enabled"))
    app.dependency_overrides[get_current_user] = current
    app.dependency_overrides[get_db] = database
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.request(
                method,
                "/api/v1/tenants/sales/discounts" + suffix.replace("{id}", str(uuid.uuid4())),
                json={},
            )
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize(
    "patch", [{"default_percent": "NaN"}, {"roles": {"cashier": 101}}, {"roles": []}]
)
def test_authority_rejects_invalid_limits(patch):
    with pytest.raises((SchemaError, ValueError)):
        SettingsIn(authority=patch)


@pytest.mark.parametrize(
    "config",
    [
        {"scope": {"product_ids": ["not-a-uuid"]}},
        {"get": {"qty": 0}},
        {"tiers": [{"from": 1, "value": 110}]},
        {"conditions": {"min_margin_percent": 100}},
    ],
)
def test_nested_rule_validation_rejects_invalid_pricing(config):
    with pytest.raises(SchemaError):
        RuleIn(name="Invalid", type="percentage", config=config)


@pytest.mark.parametrize(
    "changed", ["hash", "pricing", "branch", "requester", "used", "status", "tenant"]
)
async def test_checkout_rejects_approval_replay_or_context_changes(monkeypatch, changed):
    user = SimpleNamespace(id=uuid.uuid4(), tenant_id=uuid.uuid4())
    branch = uuid.uuid4()
    result = price_cart(
        [Line("0", Decimal(100), Decimal(1))],
        [],
        Context(
            now=datetime.now(UTC),
            manual_allowed=True,
            manual={"kind": "percent", "value": 10},
            authority_percent=Decimal(5),
        ),
    )
    row = SimpleNamespace(
        kind="discount",
        status="approved",
        requested_by=user.id,
        branch_id=branch,
        applied_at=None,
        payload={"context_hash": result.context_hash, "pricing": result.dump()},
    )
    if changed == "hash":
        row.payload["context_hash"] = "different"
    if changed == "pricing":
        row.payload["pricing"] = {}
    if changed == "branch":
        row.branch_id = uuid.uuid4()
    if changed == "requester":
        row.requested_by = uuid.uuid4()
    if changed == "used":
        row.applied_at = datetime.now(UTC)
    if changed == "status":
        row.status = "pending"
    monkeypatch.setattr(
        service,
        "quote",
        AsyncMock(
            return_value=(
                result,
                [],
                {},
                {**service.settings.defaults(), "enabled": True, "approvals": True},
            )
        ),
    )
    monkeypatch.setattr(
        DiscountRepository,
        "get_for_tenant",
        AsyncMock(return_value=None if changed == "tenant" else row),
    )
    data = PriceIn(items=[{"unit_price": 100, "quantity": 1}], discount_approval_id=uuid.uuid4())
    with pytest.raises(ForbiddenError):
        await service.validate_checkout(SimpleNamespace(), user, data, branch)
