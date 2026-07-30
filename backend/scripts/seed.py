r"""Seed the base tenant 'onegemmy' with admin user, default roles, and permissions.

Usage:
    .venv\Scripts\python -m scripts.seed
"""

import asyncio
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.core.security import hash_password
from app.modules.tenants.models import Branch, Department, Permission, Role, Tenant, User

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
        description="Standard user access",
    )
    session.add(user_role)

    admin = User(
        tenant_id=tenant.id,
        email="admin@onegemmy.com",
        hashed_password=hash_password("admin123"),
        full_name="OneGemmy Admin",
        role="admin",
        role_id=admin_role.id,
        is_active=True,
        is_superuser=True,
    )
    session.add(admin)

    user = User(
        tenant_id=tenant.id,
        email="user@onegemmy.com",
        hashed_password=hash_password("user123"),
        full_name="OneGemmy User",
        role="user",
        role_id=user_role.id,
        is_active=True,
        is_superuser=False,
    )
    session.add(user)

    await session.flush()

    superadmin = User(
        tenant_id=None,
        email="superadmin@onegemmy.com",
        hashed_password=hash_password("superadmin123"),
        full_name="Global Super Admin",
        role="superadmin",
        is_active=True,
        is_superuser=True,
    )
    session.add(superadmin)

    admin_role.permissions = permissions
    await session.commit()
    log.info("seed.complete", extra={"_extra_fields": {
        "tenant_id": str(tenant.id),
        "admin_email": "admin@onegemmy.com",
        "user_email": "user@onegemmy.com",
        "super_admin_email": "superadmin@onegemmy.com",
        "permissions_count": len(permissions),
    }})


async def main() -> None:
    async with AsyncSessionLocal() as session:
        await seed(session)


if __name__ == "__main__":
    asyncio.run(main())
