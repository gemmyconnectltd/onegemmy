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
    return SimpleNamespace(id="u1", tenant_id="t1", is_superuser=superuser, disabled_modules=disabled, permissions_names=["items:read", "items:update"])


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
