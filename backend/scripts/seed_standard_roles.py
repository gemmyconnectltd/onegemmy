"""Add the standard ERP job roles (Sales Manager, Purchasing Officer, HR Manager, ...) to every business that does not have them yet.

Safe to run again: it only creates roles that are missing and never changes the permissions of a role a business already has.

Usage:
    cd backend
    .venv/bin/python -m scripts.seed_standard_roles [--dry-run]
"""
import argparse
import asyncio

import app.main  # noqa: F401  registers every model before the session is used
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.modules.tenants.models import Role, Tenant
from app.modules.tenants.service.role import FOCUSED_ROLES, seed_default_roles


async def main(dry_run: bool) -> None:
    async with AsyncSessionLocal() as db:
        tenants = (await db.execute(select(Tenant))).scalars().all()
        added_total = 0
        for tenant in tenants:
            before = {r.name for r in (await db.execute(select(Role).where(Role.tenant_id == tenant.id))).scalars().all()}
            await seed_default_roles(db, tenant.id)
            after = {r.name for r in (await db.execute(select(Role).where(Role.tenant_id == tenant.id))).scalars().all()}
            added = sorted(after - before)
            added_total += len(added)
            print(f"{tenant.name}: +{len(added)} role(s)" + (f" ({', '.join(added)})" if added else ""))
        if dry_run:
            await db.rollback()
            print(f"Dry run: {added_total} roles would be added across {len(tenants)} businesses. Nothing was saved.")
        else:
            await db.commit()
            print(f"Done: {added_total} roles added across {len(tenants)} businesses ({len(FOCUSED_ROLES)} job roles are standard).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    asyncio.run(main(parser.parse_args().dry_run))
