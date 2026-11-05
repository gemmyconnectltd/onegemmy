"""Give (or take away) Data Management permissions for a platform administrator.

    python -m scripts.grant_data_permissions --email admin@example.com --grant view,preview,request,history
    python -m scripts.grant_data_permissions --email admin@example.com --revoke execute
    python -m scripts.grant_data_permissions --email admin@example.com --show

Names are the part after "data:" (view, preview, request, approve, execute, history, recovery), or "all". Only a platform
administrator (role superadmin, no business) can hold them. Every change is written to the audit log.
"""
import argparse
import asyncio

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.modules.admin.data_management import permissions as perms
from app.modules.audit.service import record_audit
from app.modules.tenants.models import User


def _names(text: str) -> list[str]:
    if text.strip().lower() == "all":
        return list(perms.ALL)
    out = []
    for raw in text.split(","):
        name = f"data:{raw.strip().removeprefix('data:')}"
        if name not in perms.ALL:
            raise SystemExit(f"Unknown permission '{raw.strip()}'. Choose from: {', '.join(p.split(':')[1] for p in perms.ALL)}, or all")
        out.append(name)
    return out


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--grant", default="")
    parser.add_argument("--revoke", default="")
    parser.add_argument("--show", action="store_true")
    args = parser.parse_args()
    async with AsyncSessionLocal() as db:
        admin = (await db.execute(select(User).where(User.email == args.email.strip().lower()))).scalar_one_or_none()
        if admin is None or not admin.is_superuser or admin.tenant_id is not None or admin.role != "superadmin":
            raise SystemExit("That email is not a platform administrator.")
        current = set(admin.platform_permissions or [])
        if args.grant:
            current |= set(_names(args.grant))
        if args.revoke:
            current -= set(_names(args.revoke))
        if args.grant or args.revoke:
            admin.platform_permissions = sorted(current)
            await record_audit(db, tenant_id=None, actor_user_id=None, actor_name="command line", action="platform.data_permissions", entity_type="user",
                               entity_id=str(admin.id), summary=f"Data Management permissions for {admin.email}", changes={"now": sorted(current)})
            await db.commit()
        print(f"{admin.email}: {', '.join(sorted(current)) or 'no Data Management permissions'}")


if __name__ == "__main__":
    asyncio.run(main())
