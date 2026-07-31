r"""Seed the base tenant 'onegemmy' with admin user, default roles, and permissions.

Usage:
    .venv\Scripts\python -m scripts.seed
"""

import asyncio
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.core.security import hash_password
from app.modules.tenants.models import Permission, Role, Tenant, User
from app.modules.tenants.repository import TenantRepository

log = get_logger("seed")

RESOURCES = [
    "tenants", "users", "roles", "permissions",
    "departments", "branches",
    "items", "warehouses", "stock", "orders", "pricing", "returns",
    "invoices", "pos",
    "chart_of_accounts", "journal_entries", "accounts_payable",
    "accounts_receivable", "banking", "fixed_assets", "budgeting", "tax",
    "employees", "organization", "recruitment", "attendance", "leave",
    "payroll", "performance",
    "vendors", "requisitions", "rfq", "purchase_orders", "goods_receipt", "contracts",
    "leads", "accounts", "contacts", "opportunities", "activities", "campaigns", "tickets",
    "bom", "routing", "mrp", "work_orders", "shop_floor", "quality", "costing",
]

ACTIONS = ["create", "read", "update", "delete", "approve"]

ROLE_RESOURCES: dict[str, list[str]] = {
    "Inventory Manager": ["items", "warehouses", "stock", "orders", "pricing", "returns"],
    "Finance Manager":   ["invoices", "chart_of_accounts", "journal_entries", "accounts_payable",
                          "accounts_receivable", "banking", "fixed_assets", "budgeting", "tax"],
    "HR Manager":        ["employees", "organization", "recruitment", "attendance", "leave",
                          "payroll", "performance"],
    "Sales Manager":     ["orders", "invoices", "pos", "leads", "accounts", "contacts",
                          "opportunities", "activities", "campaigns", "tickets"],
    "Procurement Manager": ["vendors", "requisitions", "rfq", "purchase_orders",
                            "goods_receipt", "contracts"],
}

BUSINESS_USERS = [
    ("inventory.manager@onegemmy.com",   "Inventory Manager",   "Inventory Manager"),
    ("inventory.staff@onegemmy.com",     "Inventory Staff",     "Inventory Manager"),
    ("finance.manager@onegemmy.com",     "Finance Manager",     "Finance Manager"),
    ("finance.staff@onegemmy.com",       "Finance Staff",       "Finance Manager"),
    ("hr.manager@onegemmy.com",          "HR Manager",          "HR Manager"),
    ("hr.staff@onegemmy.com",            "HR Staff",            "HR Manager"),
    ("sales.manager@onegemmy.com",       "Sales Manager",       "Sales Manager"),
    ("sales.staff@onegemmy.com",         "Sales Staff",         "Sales Manager"),
    ("procurement.manager@onegemmy.com", "Procurement Manager", "Procurement Manager"),
    ("procurement.staff@onegemmy.com",   "Procurement Staff",   "Procurement Manager"),
]


async def seed(session: AsyncSession) -> None:
    tenant = await TenantRepository(session).get_by_slug("onegemmy")
    if tenant:
        log.info("seed.already_seeded")
        return

    tenant = Tenant(
        id=uuid.UUID(int=1),
        name="OneGemmy",
        slug="onegemmy",
        is_active=True,
        subscription_plan="enterprise",
        subscription_status="active",
    )
    session.add(tenant)

    permissions = []
    for resource in RESOURCES:
        for action in ACTIONS:
            perm = Permission(
                name=f"{resource}:{action}",
                resource=resource,
                action=action,
                description=f"Can {action} {resource}",
            )
            session.add(perm)
            permissions.append(perm)

    admin_role = Role(
        id=uuid.UUID(int=2),
        name="Admin",
        tenant_id=tenant.id,
        description="Full system access",
        permissions=permissions,
    )
    session.add(admin_role)

    user_role = Role(
        id=uuid.UUID(int=3),
        name="User",
        tenant_id=tenant.id,
        description="Standard read-only access",
    )
    session.add(user_role)

    business_roles: dict[str, Role] = {}
    for idx, (role_name, resources) in enumerate(ROLE_RESOURCES.items(), start=4):
        role_perms = [p for p in permissions if p.resource in resources]
        role = Role(
            id=uuid.UUID(int=idx),
            name=role_name,
            tenant_id=tenant.id,
            description=f"Manages {', '.join(resources[:2])} and related resources",
            permissions=role_perms,
        )
        session.add(role)
        business_roles[role_name] = role

    session.add(User(
        tenant_id=tenant.id,
        email="admin@onegemmy.com",
        hashed_password=hash_password(settings.SEED_ADMIN_PASSWORD),
        full_name="OneGemmy Admin",
        role="admin",
        role_id=admin_role.id,
        is_active=True,
        is_superuser=True,
    ))

    session.add(User(
        tenant_id=tenant.id,
        email="user@onegemmy.com",
        hashed_password=hash_password(settings.SEED_USER_PASSWORD),
        full_name="OneGemmy User",
        role="user",
        role_id=user_role.id,
        is_active=True,
        is_superuser=False,
    ))

    for email, full_name, role_name in BUSINESS_USERS:
        session.add(User(
            tenant_id=tenant.id,
            email=email,
            hashed_password=hash_password(settings.SEED_USER_PASSWORD),
            full_name=full_name,
            role="member",
            role_id=business_roles[role_name].id,
            is_active=True,
            is_superuser=False,
        ))

    await session.flush()

    session.add(User(
        tenant_id=None,
        email="superadmin@onegemmy.com",
        hashed_password=hash_password(settings.SEED_SUPER_ADMIN_PASSWORD),
        full_name="Global Super Admin",
        role="superadmin",
        is_active=True,
        is_superuser=True,
    ))

    admin_role.permissions = permissions
    await session.commit()
    log.info("seed.complete", extra={"_extra_fields": {
        "tenant_id": str(tenant.id),
        "permissions_count": len(permissions),
    }})


async def seed_business_users(session: AsyncSession) -> None:
    """Insert missing business roles and users into an existing tenant."""
    tenant = await TenantRepository(session).get_by_slug("onegemmy")
    if not tenant:
        log.info("seed_business_users.no_tenant")
        return

    all_permissions = (await session.execute(select(Permission))).scalars().all()

    business_roles: dict[str, Role] = {}
    for role_name, resources in ROLE_RESOURCES.items():
        existing = (await session.execute(
            select(Role).where(Role.tenant_id == tenant.id, Role.name == role_name)
        )).scalar_one_or_none()

        if existing:
            business_roles[role_name] = existing
        else:
            role_perms = [p for p in all_permissions if p.resource in resources]
            role = Role(
                name=role_name,
                tenant_id=tenant.id,
                description=f"Manages {', '.join(resources[:2])} and related resources",
                permissions=role_perms,
            )
            session.add(role)
            await session.flush()
            business_roles[role_name] = role
            log.info(f"seed_business_users.role_created: {role_name}")

    for email, full_name, role_name in BUSINESS_USERS:
        exists = (await session.execute(
            select(User).where(User.email == email)
        )).scalar_one_or_none()

        if exists:
            log.info(f"seed_business_users.skip_existing: {email}")
            continue

        session.add(User(
            tenant_id=tenant.id,
            email=email,
            hashed_password=hash_password(settings.SEED_USER_PASSWORD),
            full_name=full_name,
            role="member",
            role_id=business_roles[role_name].id,
            is_active=True,
            is_superuser=False,
        ))
        log.info(f"seed_business_users.created: {email}")

    await session.commit()
    log.info("seed_business_users.complete")


async def main() -> None:
    async with AsyncSessionLocal() as session:
        await seed(session)
    async with AsyncSessionLocal() as session:
        await seed_business_users(session)


if __name__ == "__main__":
    asyncio.run(main())
