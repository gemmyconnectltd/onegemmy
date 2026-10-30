"""Turn every module back on for every business.

Clears both layers that can switch a module off:
  * tenants.features           - Pesaa's own restrictions ("Restricted" in the ERP)
  * tenants.module_activation  - modules a business administrator switched off

Modules the plan does not include stay "Not included"; this never grants plan entitlements.
Nothing is written unless --apply is passed.

Usage:
    cd backend
    .venv/bin/python -m scripts.enable_all_features            # preview only
    .venv/bin/python -m scripts.enable_all_features --apply    # write the changes
"""

import argparse
import asyncio

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger, setup_logging
from app.modules.tenants.models import Tenant

log = get_logger("enable-all-features")


async def main(apply: bool) -> None:
    async with AsyncSessionLocal() as db:
        tenants = (await db.execute(select(Tenant))).scalars().all()
        changed = 0
        for tenant in tenants:
            restricted = sorted(k for k, v in (tenant.features or {}).items() if v is False)
            business_off = sorted(k for k, v in (getattr(tenant, "module_activation", None) or {}).items() if v is False)
            if not (tenant.features or getattr(tenant, "module_activation", None)):
                continue
            print(f"{tenant.name}: restricted={restricted or '-'} business_off={business_off or '-'}")
            if apply:
                tenant.features = {}
                tenant.module_activation = {}
            changed += 1

        if apply:
            await db.commit()
        else:
            await db.rollback()

        log.info(
            "enable_all_features.done",
            extra={"_extra_fields": {"changed": changed, "total": len(tenants), "applied": apply}},
        )
        if not apply and changed:
            print("\nPreview only. Re-run with --apply to write these changes.")


if __name__ == "__main__":
    setup_logging()
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Write the changes (default is a preview)")
    args = parser.parse_args()
    asyncio.run(main(args.apply))
