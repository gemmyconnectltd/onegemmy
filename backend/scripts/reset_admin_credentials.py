"""Reset platform + tenant admin credentials to the seeded defaults.

Only touches admin accounts (global superadmin and tenant admins). Regular
business users are never modified.

Usage:
    cd backend
    .venv/bin/python -m scripts.reset_admin_credentials [--superadmin-password P] [--admin-password P]
"""

import argparse
import asyncio
import sys

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.core.security import hash_password
from app.modules.tenants.models import User

log = get_logger("reset-admin-credentials")


async def reset_superadmin(password: str) -> None:
    async with AsyncSessionLocal() as session:
        user = (
            await session.execute(select(User).where(User.email == "superadmin@onegemmy.com"))
        ).scalar_one_or_none()
        if user is None:
            log.warning("reset.superadmin.missing")
            return
        if user.tenant_id is not None:
            log.error("reset.superadmin.invalid_tenant")
            sys.exit(1)
        user.hashed_password = hash_password(password)
        await session.commit()
        log.info("reset.superadmin.done")


async def reset_tenant_admins(password: str) -> None:
    async with AsyncSessionLocal() as session:
        admins = (
            await session.execute(
                select(User).where(User.is_superuser.is_(True), User.tenant_id.isnot(None))
            )
        ).scalars().all()
        for admin in admins:
            admin.hashed_password = hash_password(password)
        await session.commit()
        log.info("reset.tenant_admins.done", extra={"_extra_fields": {"count": len(admins)}})


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--superadmin-password",
        default=settings.SEED_SUPER_ADMIN_PASSWORD,
        help="New password for the global superadmin",
    )
    parser.add_argument(
        "--admin-password",
        default=settings.SEED_ADMIN_PASSWORD,
        help="New password for every tenant admin",
    )
    args = parser.parse_args()

    await reset_superadmin(args.superadmin_password)
    await reset_tenant_admins(args.admin_password)
    log.info("reset.complete")


if __name__ == "__main__":
    asyncio.run(main())
