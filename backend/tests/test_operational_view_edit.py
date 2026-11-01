"""Operational view/edit is available without widening sensitive action grants."""
import uuid

from app.core.access import decide, decide_read
from app.core.permission_policy import effective_permissions, permissions_for_method
from app.modules.tenants.models import User


def test_existing_active_business_users_can_view_and_edit_operational_modules():
    user = User(tenant_id=uuid.uuid4(), is_active=True, role="viewer", role_rel=None)
    grants = user.permissions_names
    for permission in ["items:read", "items:update", "orders:read", "orders:update",
                       "purchase_orders:read", "purchase_orders:update", "employees:read"]:
        assert permission in grants
    assert decide_read("inventory", "/inventory/products", grants)[0]
    assert decide("inventory", "PATCH", "/inventory/products/any", grants)[0]


def test_create_delete_approve_and_security_administration_are_not_baseline_access():
    grants = effective_permissions([], business_user=True)
    assert all(name.rsplit(":", 1)[1] in {"read", "update"} for name in grants)
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
    from app.modules.tenants.service.role import _PERMISSION_RESOURCES
    administration = {"tenants", "users", "roles", "permissions", "branches", "billing", "approvals", "credit"}
    assert set(_PERMISSION_RESOURCES) - administration == OPERATIONAL_RESOURCES
