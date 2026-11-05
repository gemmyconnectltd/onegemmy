"""Role repairs reuse the canonical templates without upgrading everyone's job."""
import argparse
import uuid

import pytest

from app.modules.tenants.models import Permission, Role, Tenant, User
from app.modules.tenants.service.role import default_role_permissions
from scripts.repair_role_access import repair_tenant, template_catalog


def test_repair_templates_preserve_least_privilege_and_all_builtin_roles():
    templates = default_role_permissions(template_catalog([]))
    from app.modules.tenants.service.role import FOCUSED_ROLES
    assert set(templates) == {"Admin", "Member", "Viewer", "Owner/CEO", "General Manager", "Branch Manager", "Factory Manager"} | set(FOCUSED_ROLES)
    assert {"Cashier", "Accountant", "Inventory Officer", "Sales Manager", "HR Manager", "Auditor"} <= set(templates)
    assert all(p.action == "read" for p in templates["Viewer"])
    assert all(p.action in {"create", "read", "update"} for p in templates["Member"])
    branch = {p.name for p in templates["Branch Manager"]}
    assert {"orders:read", "items:read", "purchase_orders:read", "employees:read"} <= branch
    assert not {"users:create", "roles:update", "billing:update", "tenants:update"} & branch
    cashier = {p.name for p in templates["Cashier"]}
    assert "pos:create" in cashier and "journal_entries:create" not in cashier


def test_catalog_preview_does_not_replace_existing_permission_objects():
    permission = Permission(name="items:read", resource="items", action="read")
    preview = template_catalog([permission])
    assert next(p for p in preview if p.name == "items:read") is permission
    assert len({p.name for p in preview}) == len(preview)
    assert len(default_role_permissions(preview)["Viewer"]) > 0


@pytest.mark.db
async def test_existing_users_are_linked_and_existing_custom_grants_preserved(db):
    tenant = Tenant(name="Role repair test", slug=uuid.uuid4().hex)
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="Branch Manager", permissions=[])
    custom = Role(tenant_id=tenant.id, name="Custom cashier", permissions=[])
    db.add_all([role, custom])
    await db.flush()
    assigned = User(tenant_id=tenant.id, email=f"{uuid.uuid4().hex}@example.test",
        full_name="Already assigned", hashed_password="x", role="branch manager", role_id=role.id)
    unassigned = User(tenant_id=tenant.id, email=f"{uuid.uuid4().hex}@example.test",
        full_name="Legacy user", hashed_password="x", role="viewer")
    unknown = User(tenant_id=tenant.id, email=f"{uuid.uuid4().hex}@example.test",
        full_name="Unknown role", hashed_password="x", role="Unknown custom role")
    db.add_all([assigned, unassigned, unknown])
    await db.flush()
    args = argparse.Namespace(apply=False, operator="Test operator", reason="Test role repair")
    preview = await repair_tenant(db, tenant, args)
    assert not preview["applied"] and not role.permissions and unassigned.role_id is None
    assert "Custom cashier" in preview["empty_custom_roles_requiring_owner_review"]
    args.apply = True
    applied = await repair_tenant(db, tenant, args)
    assert applied["users_linked"] == 1
    assert assigned.role_id == role.id and unassigned.role_id is not None
    assert unknown.role_id is None and not custom.permissions
    assert {p.name for p in role.permissions} >= {"items:read", "orders:read"}
    again = await repair_tenant(db, tenant, args)
    assert again["users_linked"] == 0 and again["role_repairs"] == []
