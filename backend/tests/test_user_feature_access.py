"""Per-person feature access: a module switched off for one user is refused by the server and shown as off in their access view."""
from types import SimpleNamespace

import pytest
from fastapi import Request

from app.core.access import require_module_write
from app.core.exceptions import ForbiddenError
from app.modules.tenants.service.access import module_access


def request(method="GET", path="/api/v1/tenants/inventory/products"):
    return Request({"type": "http", "method": method, "path": path, "headers": []})


def person(disabled, superuser=False):
    return SimpleNamespace(id="u1", tenant_id="t1", role="custom", is_superuser=superuser, disabled_modules=disabled, permissions_names=["items:read", "items:update"])


async def test_switched_off_module_is_refused_for_reads_and_writes():
    check = require_module_write("inventory")
    for method in ("GET", "PATCH"):
        with pytest.raises(ForbiddenError):
            await check(request(method), person(["inventory"]))


async def test_other_modules_and_unrestricted_people_still_work():
    await require_module_write("inventory")(request("GET"), person(["sales"]))
    await require_module_write("inventory")(request("PATCH"), person(None))
    await require_module_write("inventory")(request("GET"), person(["inventory"], superuser=True))  # the owner is never restricted


def test_access_view_marks_the_module_off_even_when_the_role_allows_it():
    states = {"inventory": "enabled", "sales": "enabled"}
    names = {"inventory": "Inventory", "sales": "Sales"}
    rows = {m["key"]: m for m in module_access({"items:read", "items:update", "orders:read"}, False, states, names, {"inventory"})}
    assert rows["inventory"]["blocked"] and not rows["inventory"]["effective_view"] and not rows["inventory"]["effective_change"]
    assert not rows["sales"]["blocked"] and rows["sales"]["effective_view"]


async def test_member_cannot_manage_employee_or_business_features_without_a_grant():
    from app.core.deps import require_permission

    user = person([])
    user.role = "member"
    for permission in ("users:update", "roles:update", "tenants:update"):
        with pytest.raises(ForbiddenError):
            await require_permission(permission)(user)
    user.permissions_names = ["users:update"]
    assert await require_permission("users:update")(user) is user


@pytest.mark.parametrize("disabled,path", [
    ("expenses", "/api/v1/tenants/expense-management/search"),
    ("expenses", "/api/v1/tenants/accounting/expenses"),
    ("debts", "/api/v1/tenants/debts/receivable/search"),
])
async def test_finance_child_switch_is_enforced_on_its_existing_accounting_router(disabled, path):
    check = require_module_write("accounting")
    user = person([disabled])
    user.role = "member"
    user.permissions_names += ["expenses:read", "expenses:update", "accounts_payable:read", "accounts_payable:update"]
    for method in ("GET", "POST", "PATCH"):
        with pytest.raises(ForbiddenError):
            await check(request(method, path), user)
    await check(request("GET", "/api/v1/tenants/accounting/accounts"), user)
    sibling = "/api/v1/tenants/debts/receivable/search" if disabled == "expenses" else "/api/v1/tenants/expense-management/search"
    await check(request("POST", sibling), user)


def test_finance_rows_have_independent_employee_switches_but_share_business_entitlement():
    rows = {m["key"]: m for m in module_access(
        {"expenses:read", "expenses:update", "accounts_payable:read"},
        False, {"accounting": "enabled"}, {"accounting": "Accounting"}, {"accounting"},
    )}
    assert rows["expenses"]["name"] == "Expenses"
    assert rows["debts"]["name"] == "Debt Management"
    for key in ("expenses", "debts"):
        assert rows[key]["status"] == "enabled"
        assert not rows[key]["blocked"]  # inherited blocking is not a stored employee choice
        assert rows[key]["blocked_by"] is None
        assert rows[key]["effective_view"]
    restored = {m["key"]: m for m in module_access(
        {"expenses:read", "accounts_payable:read"}, False,
        {"accounting": "restricted"}, {}, set(),
    )}
    assert not restored["expenses"]["effective_view"]
    assert not restored["debts"]["effective_view"]


async def test_accounting_off_does_not_block_enabled_expenses_or_debts():
    check = require_module_write("accounting")
    user = person(["accounting"])
    user.role = "member"
    user.permissions_names += ["expenses:read", "expenses:update", "accounts_payable:read", "accounts_payable:update"]
    for method in ("GET", "POST", "PATCH"):
        await check(request(method, "/api/v1/tenants/expense-management/search"), user)
        await check(request(method, "/api/v1/tenants/accounting/expenses"), user)
        await check(request(method, "/api/v1/tenants/debts/receivable/search"), user)
        with pytest.raises(ForbiddenError):
            await check(request(method, "/api/v1/tenants/accounting/accounts"), user)
