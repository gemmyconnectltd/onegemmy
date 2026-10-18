
from sqlalchemy import func, select

from app.core.repository import BaseRepository
from app.modules.tenants.models import Tenant, TenantSlugAlias


class TenantRepository(BaseRepository[Tenant]):
    model = Tenant

    async def get_by_slug(self, slug: str) -> Tenant | None:
        result = await self.db.execute(select(Tenant).where((Tenant.slug == slug) | Tenant.id.in_(
            select(TenantSlugAlias.tenant_id).where(TenantSlugAlias.slug == slug)
        )))
        return result.scalar_one_or_none()

    async def list_all(self, offset: int = 0, limit: int = 20) -> list[Tenant]:
        result = await self.db.execute(
            select(Tenant).order_by(Tenant.created_at.desc()).offset(offset).limit(limit)
        )
        return list(result.scalars().all())

    async def count_all(self) -> int:
        result = await self.db.execute(select(func.count()).select_from(Tenant))
        return result.scalar_one()

    async def admin_page(self, offset: int, limit: int, filters: dict) -> tuple[list[Tenant], int]:
        """Filter and sort before pagination, including aggregate user counts."""
        from datetime import date, timedelta

        from sqlalchemy import or_
        from sqlalchemy.orm import lazyload

        from app.modules.tenants.models import User

        conditions = []
        if query := filters.get("q"):
            like = f"%{query.strip()}%"
            conditions.append(or_(Tenant.name.ilike(like), Tenant.slug.ilike(like),
                                  Tenant.phone.ilike(like), Tenant.website.ilike(like)))
        status = filters.get("status")
        if status == "active":
            conditions.append(Tenant.is_active.is_(True))
        elif status == "pending":
            conditions.extend([Tenant.is_active.is_(False), Tenant.subscription_status == "pending"])
        elif status == "suspended":
            conditions.extend([Tenant.is_active.is_(False), Tenant.subscription_status != "pending"])
        elif status == "trial":
            conditions.append(Tenant.subscription_status.in_(["trial", "trialing"]))
        elif status == "cancelled":
            conditions.append(Tenant.subscription_status.in_(["cancelled", "canceled"]))
        for field, key in [("subscription_plan", "plan"), ("country", "country"),
                           ("industry", "industry"), ("business_type", "businessType"),
                           ("heard_about", "heardAbout")]:
            if (value := filters.get(key)) and value != "all":
                conditions.append(getattr(Tenant, field) == value)
        if value := filters.get("from"):
            conditions.append(Tenant.created_at >= date.fromisoformat(value))
        if value := filters.get("to"):
            conditions.append(Tenant.created_at < date.fromisoformat(value) + timedelta(days=1))
        count = (await self.db.execute(select(func.count()).select_from(Tenant).where(*conditions))).scalar_one()
        users = select(User.tenant_id, func.count().label("count")).group_by(User.tenant_id).subquery()
        columns = {"name": func.lower(func.btrim(Tenant.name)), "plan": Tenant.subscription_plan,
                   "created": Tenant.created_at, "users": func.coalesce(users.c.count, 0)}
        sort = columns.get(filters.get("sort"), Tenant.created_at)
        sort = sort.asc() if filters.get("dir") == "asc" else sort.desc()
        rows = (await self.db.execute(select(Tenant).options(lazyload("*"))
                .outerjoin(users, users.c.tenant_id == Tenant.id).where(*conditions)
                .order_by(sort, Tenant.id).offset(offset).limit(limit))).scalars().all()
        return list(rows), count
