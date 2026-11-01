"""Diagnose and repair existing users' role access on the target server.

cd backend
.venv/bin/python -m scripts.repair_role_access --tenant BUSINESS_SLUG
.venv/bin/python -m scripts.repair_role_access --tenant BUSINESS_SLUG --apply \
    --operator 'Your name' --reason 'Restore missing role permissions'

Use --all-tenants instead of --tenant to explicitly select every business.
Preview is database-enforced read-only. Apply restores missing built-in role grants
and links users whose role_id is null using their existing role name. Existing valid
assignments, custom role permissions, branch assignments, user disabled modules,
plan entitlements and business restrictions remain unchanged. Existing extra grants
are preserved. Built-in roles intentionally have different access levels.
"""
import argparse
import asyncio
import json
import uuid

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import app.main  # noqa: F401 — register models without starting the server
from app.core.database import AsyncSessionLocal, engine
from app.modules.accounting.repository.reporting import ReportingRepository
from app.modules.audit.service import record_audit
from app.modules.tenants.models import Permission, Role, Tenant, User
from app.modules.tenants.service.role import (
    _PERMISSION_ACTIONS,
    _PERMISSION_RESOURCES,
    _ROLE_NAME_ALIASES,
    default_role_permissions,
    ensure_permissions_seeded,
)


def template_catalog(existing: list[Permission]) -> list[Permission]:
    """Build a preview of the complete catalog without inserting any records."""
    by_name = {p.name: p for p in existing}
    for resource in _PERMISSION_RESOURCES:
        for action in _PERMISSION_ACTIONS:
            name = f"{resource}:{action}"
            if name not in by_name:
                by_name[name] = Permission(name=name, resource=resource, action=action)
    return list(by_name.values())


async def repair_tenant(db: AsyncSession, tenant: Tenant, args: argparse.Namespace) -> dict:
    if args.apply:
        await ReportingRepository(db).lock_tenant(tenant.id)
    catalog = list(await db.scalars(select(Permission).order_by(Permission.name)))
    templates = default_role_permissions(template_catalog(catalog))
    roles: dict[str, Role] = {}
    offset = 0
    while True:
        page = list(await db.scalars(select(Role).options(selectinload(Role.permissions))
            .where(Role.tenant_id == tenant.id).order_by(Role.id).offset(offset).limit(100)))
        if not page:
            break
        for role in page:
            key = role.name.strip().lower()
            if key in roles:
                raise ValueError(f"Ambiguous role names in business {tenant.slug}; resolve duplicates first")
            roles[key] = role
        offset += len(page)
    changes = []
    for name, expected in templates.items():
        role = roles.get(name.lower())
        current = {p.name for p in role.permissions} if role else set()
        missing = sorted({p.name for p in expected} - current)
        if missing or role is None:
            members = await db.scalar(select(func.count()).select_from(User).where(
                User.tenant_id == tenant.id, User.role_id == role.id)) if role else 0
            changes.append({"role": name, "create": role is None,
                "existing_permission_count": len(current), "members": members or 0,
                "permissions_to_add": missing})
    custom_empty = sorted(role.name for key, role in roles.items()
                          if key not in {name.lower() for name in templates} and not role.permissions)
    unassigned = [User.tenant_id == tenant.id, User.is_superuser.is_(False), User.role_id.is_(None)]
    labels = (await db.execute(select(User.role, func.count()).where(*unassigned)
        .group_by(User.role).order_by(User.role))).all()
    link_plan = []
    for label, count in labels:
        name = _ROLE_NAME_ALIASES.get((label or "").strip().lower(), (label or "").strip())
        known = name.lower() in roles or name in templates
        link_plan.append({"existing_role_label": label, "count": count,
                          "target_role": name if known else None})
    disabled_users = await db.scalar(select(func.count()).select_from(User).where(
        User.tenant_id == tenant.id,
        func.coalesce(func.jsonb_array_length(User.disabled_modules), 0) > 0)) or 0
    report = {"users_with_disabled_modules": disabled_users, "business_slug": tenant.slug, "mode": "apply" if args.apply else "preview",
        "role_repairs": changes, "users_without_role": link_plan,
        "empty_custom_roles_requiring_owner_review": custom_empty,
        "business_restrictions": sorted(k for k, v in (tenant.features or {}).items() if v is False),
        "business_disabled_modules": sorted(k for k, v in (tenant.module_activation or {}).items() if v is False),
        "applied": False}
    if not args.apply:
        return report
    actual = {p.name: p for p in await ensure_permissions_seeded(db)}
    for change in changes:
        name = change["role"]
        role = roles.get(name.lower())
        if role is None:
            role = Role(tenant_id=tenant.id, name=name, permissions=[],
                        description="Business role template; restored by explicit maintenance.")
            db.add(role)
            roles[name.lower()] = role
        role.permissions.extend(actual[name] for name in change["permissions_to_add"])
    await db.flush()
    linked = 0
    for plan in link_plan:
        if plan["target_role"] is None:
            continue  # Never fall back to Member/Admin for an unknown custom role.
        role = roles[plan["target_role"].lower()]
        while True:
            page = list(await db.scalars(select(User).where(*unassigned,
                User.role == plan["existing_role_label"]).order_by(User.id).with_for_update().limit(100)))
            if not page:
                break
            for user in page:
                user.role_id = role.id
                linked += 1
            await db.flush()
    if changes or linked:
        await record_audit(db, tenant_id=tenant.id, actor_user_id=None, actor_name=args.operator,
            action="role.access_repair", entity_type="tenant", entity_id=str(tenant.id),
            summary="Explicitly restored built-in role permissions and missing user role links",
            changes={"role_repairs": changes, "users_linked": linked, "reason": args.reason,
                     "source": "repair_role_access"})
    report["applied"] = True
    report["users_linked"] = linked
    return report


async def run(args: argparse.Namespace) -> None:
    try:
        after: uuid.UUID | None = None
        while True:
            async with AsyncSessionLocal() as db:
                if not args.apply:
                    await db.execute(text("SET TRANSACTION READ ONLY"))
                query = select(Tenant).order_by(Tenant.id).limit(1)
                if args.tenant:
                    query = query.where(Tenant.slug == args.tenant)
                if after:
                    query = query.where(Tenant.id > after)
                tenant = await db.scalar(query)
                if tenant is None:
                    if args.tenant and after is None:
                        raise ValueError("Business slug not found in this server's database")
                    break
                next_id = tenant.id
                report = await repair_tenant(db, tenant, args)
                if args.apply:
                    await db.commit()
                else:
                    await db.rollback()
                print(json.dumps(report, indent=2))
                after = next_id
                if args.tenant:
                    break
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument("--tenant", help="Exact business slug")
    scope.add_argument("--all-tenants", action="store_true", help="Explicitly select every business")
    parser.add_argument("--apply", action="store_true", help="Restore the grants and role links shown in preview")
    parser.add_argument("--operator", default="", help="Operator name recorded in the audit trail")
    parser.add_argument("--reason", default="", help="Reason for the explicit permission restoration")
    args = parser.parse_args()
    if args.apply and (not args.operator.strip() or len(args.reason.strip()) < 5):
        parser.error("--apply requires --operator and a --reason of at least five characters")
    try:
        asyncio.run(run(args))
    except ValueError as exc:
        parser.exit(2, f"Repair refused: {exc}\n")
