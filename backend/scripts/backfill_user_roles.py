"""Backfill role_id for users that predate default role seeding.

Every user invited before this fix (via admin_invite_user or the tenant
self-service create_user) only ever got a free-text `role` string — role_id
was never set, since no tenant had real Admin/Member/Viewer roles to point
to. With role_id=None, a user's permissions list is always empty (see
User.permissions_names), which means an almost-empty sidebar: every module
nav item is gated on a permission check, so only Dashboard/Reports/Settings
(which aren't) ever show up. This seeds the missing default roles for every
tenant that doesn't have them yet, then assigns each affected user the role
matching their existing `role` string (falling back to Member for anything
unrecognized) so they get real access without needing to be re-invited.

Usage:
    cd backend
    .venv/bin/python -m scripts.backfill_user_roles [--dry-run]
"""

import argparse
import asyncio

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger, setup_logging
from app.modules.tenants.models import Tenant, User
from app.modules.tenants.service.role import resolve_role_id, seed_default_roles

log = get_logger("backfill-user-roles")


async def main(dry_run: bool) -> None:
    async with AsyncSessionLocal() as db:
        tenants = (await db.execute(select(Tenant))).scalars().all()
        for tenant in tenants:
            await seed_default_roles(db, tenant.id)
        if dry_run:
            await db.rollback()
        else:
            await db.commit()
        log.info("backfill.roles_seeded", extra={"_extra_fields": {"tenants": len(tenants), "dry_run": dry_run}})

    async with AsyncSessionLocal() as db:
        # Only non-superuser, tenant-scoped users can be affected — the
        # tenant owner bypasses permission checks entirely via is_superuser,
        # and platform superadmins have no tenant_id at all.
        broken = (
            await db.execute(
                select(User).where(User.tenant_id.isnot(None), User.is_superuser.is_(False), User.role_id.is_(None))
            )
        ).scalars().all()
        fixed = 0
        for user in broken:
            role_id = await resolve_role_id(db, user.tenant_id, user.role)
            if role_id is None:
                log.warning("backfill.user.unresolved", extra={"_extra_fields": {"user_id": str(user.id), "email": user.email}})
                continue
            log.info("backfill.user", extra={"_extra_fields": {
                "user_id": str(user.id), "email": user.email, "role": user.role, "role_id": str(role_id),
            }})
            if not dry_run:
                user.role_id = role_id
            fixed += 1
        if dry_run:
            await db.rollback()
        else:
            await db.commit()
        log.info("backfill.done", extra={"_extra_fields": {"users_fixed": fixed, "total_broken": len(broken), "dry_run": dry_run}})


if __name__ == "__main__":
    setup_logging()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Log what would change without writing anything")
    args = parser.parse_args()
    asyncio.run(main(args.dry_run))
