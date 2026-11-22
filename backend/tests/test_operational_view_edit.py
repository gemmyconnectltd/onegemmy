"""Operational view/edit is available without widening sensitive action grants."""
import uuid

from app.core.access import decide, decide_read
from app.core.permission_policy import effective_permissions, permissions_for_method
from app.modules.tenants.models import User


def test_existing_active_business_users_can_view_and_edit_operational_modules():
    user = User(tenant_id=uuid.uuid4(), is_active=True, role="viewer", role_rel=None)
    grants = user.permissions_names
    for permission in ["items:read", "items:update", "orders:read", "orders:update",
                       "purchase_orders:read", "purchase_orders:update", "employees:read",
                       "discounts:read", "reports:read"]:
        assert permission in grants
    assert decide_read("inventory", "/inventory/products", grants)[0]
    assert decide_read("reports", "/reports/performance", grants)[0]
    assert decide("inventory", "PATCH", "/inventory/products/any", grants)[0]


def test_non_checkout_creation_delete_approval_and_administration_are_not_baseline_access():
    grants = effective_permissions([], business_user=True)
    assert {name for name in grants if name.endswith(":create")} == {"orders:create", "pos:create", "contacts:create", "credit:create", "returns:create"}  # every till selling feature
    assert not any(name.endswith((":delete", ":approve")) for name in grants)
    for resource in ["users", "roles", "permissions", "billing", "tenants", "branches", "approvals", "credit"]:
        assert f"{resource}:read" not in grants
        assert f"{resource}:update" not in grants
    assert not decide("inventory", "DELETE", "/inventory/products/any", grants)[0]
    assert not decide("inventory", "POST", "/inventory/products", permissions_for_method("POST", grants, []))[0]
    assert decide("inventory", "POST", "/inventory/products", permissions_for_method("POST", grants, ["items:create"]))[0]


def test_platform_and_inactive_users_receive_no_baseline_and_assigned_grants_survive():
    assert effective_permissions([], business_user=False) == []
    for tenant_id, active in [(None, True), (uuid.uuid4(), False)]:
        user = User(tenant_id=tenant_id, is_active=active, role_rel=None)
        assert user.permissions_names == []
    assert "items:delete" in effective_permissions(["items:delete"], business_user=True)



def test_policy_covers_the_catalogs_operational_resources():
    from app.core.permission_policy import OPERATIONAL_RESOURCES
    from app.modules.tenants.service.role import _EXPLICIT_RESOURCES, _PERMISSION_RESOURCES
    administration = {"tenants", "users", "roles", "permissions", "branches", "billing", "approvals", "credit", "discounts"}
    assert set(_PERMISSION_RESOURCES) - administration - _EXPLICIT_RESOURCES == OPERATIONAL_RESOURCES


def test_default_view_covers_every_module_resource():
    from app.core.access import MODULE_RESOURCES
    from app.core.permission_policy import MODULE_VIEW_RESOURCES

    module_resources = set().union(*MODULE_RESOURCES.values())
    assert module_resources <= MODULE_VIEW_RESOURCES



def test_checkout_creation_is_allowed_without_opening_other_post_actions():
    grants = effective_permissions([], business_user=True)
    checkout = permissions_for_method("POST", grants, [], path="/sales/orders")
    assert decide("sales", "POST", "/sales/orders", checkout)[0]
    for path in ["/sales/orders/bulk", "/sales/orders/123/payments",
                 "/sales/orders/123/approve", "/sales/customers/bulk"]:
        held = permissions_for_method("POST", grants, [], path=path)
        assert not decide("sales", "POST", path, held)[0]
    # every till user takes returns and asks for discount approval; approving stays a separate grant
    for path in ["/sales/returns", "/sales/discounts/approvals"]:
        assert decide("sales", "POST", path, permissions_for_method("POST", grants, [], path=path))[0]
    # adding the buyer is part of taking a sale: one customer at a time, never an import
    assert decide("sales", "POST", "/sales/customers", permissions_for_method("POST", grants, [], path="/sales/customers"))[0]
    for method, path in [("POST", "/sales/orders"), ("DELETE", "/sales/orders/123")]:
        held = permissions_for_method(method, effective_permissions([], business_user=False), [], path=path)
        assert not decide("sales", method, path, held)[0]
