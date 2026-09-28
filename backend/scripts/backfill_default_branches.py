"""Backfill a default "Main Branch" for tenants that have no branches yet.

Usage:
    cd backend
    .venv/bin/python -m scripts.backfill_default_branches [--dry-run]
"""

import argparse
import asyncio

from sqlalchemy import select, func

from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger, setup_logging
from app.modules.tenants.models import Tenant
from app.modules.tenants.models.branch import Branch

log = get_logger("backfill-default-branches")


async def main(dry_run: bool) -> None:
    async with AsyncSessionLocal() as db:
        tenants = (await db.execute(select(Tenant))).scalars().all()
        seeded = 0
        for tenant in tenants:
            count = (
                await db.execute(
                    select(func.count()).where(Branch.tenant_id == tenant.id)
                )
            ).scalar_one()
            if count > 0:
                log.info("backfill.skip", extra={"_extra_fields": {"tenant": tenant.name, "branches": count}})
                continue
            log.info("backfill.seed", extra={"_extra_fields": {"tenant": tenant.name, "dry_run": dry_run}})
            if not dry_run:
                db.add(Branch(tenant_id=tenant.id, name="Main Branch", status="active"))
            seeded += 1

        if dry_run:
            await db.rollback()
        else:
            await db.commit()

        log.info("backfill.done", extra={"_extra_fields": {"seeded": seeded, "total": len(tenants), "dry_run": dry_run}})


if __name__ == "__main__":
    setup_logging()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Log what would change without writing anything")
    args = parser.parse_args()
    asyncio.run(main(args.dry_run))
