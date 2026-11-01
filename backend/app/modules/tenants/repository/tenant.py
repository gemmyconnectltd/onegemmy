import re

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

    @staticmethod
    def admin_conditions(filters: dict) -> list:
        """The one definition of every tenant filter, used by the business list, its export and the feature-usage figures, so they always describe the same group."""
        from datetime import date, timedelta

        from sqlalchemy import or_

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
        for field, key in [("subscription_plan", "plan"), ("country", "country"), ("industry", "industry"),
                           ("business_type", "businessType"), ("heard_about", "heardAbout"), ("employee_count", "size")]:
            if (value := filters.get(key)) and value != "all":
                conditions.append(getattr(Tenant, field) == value)
        if value := filters.get("from"):
            conditions.append(Tenant.created_at >= date.fromisoformat(value))
        if value := filters.get("to"):
            conditions.append(Tenant.created_at < date.fromisoformat(value) + timedelta(days=1))
        if (key := filters.get("feature")) and filters.get("featureState") in ("using", "not_using"):
            from app.modules.admin.usage import MODULES
            if key in MODULES:
                using = Tenant.id.in_(select(MODULES[key][1].tenant_id).distinct())
                conditions.append(using if filters["featureState"] == "using" else ~using)
        return conditions

    async def filter_options(self) -> dict:
        """What the filter menus offer, with how many businesses have each value."""
        async def counted(column):
            rows = (await self.db.execute(select(column, func.count(Tenant.id)).where(Tenant.archived_at.is_(None), column.is_not(None), column != "")
                                          .group_by(column).order_by(func.count(Tenant.id).desc(), column))).all()
            return [{"value": v, "count": int(c)} for v, c in rows]
        sizes = await counted(Tenant.employee_count)
        # The sign-up sizes are "Just me", "2-5", "6-10", "11-50", "51-200", "200+": smallest first, whatever labels exist.
        def smallest(label: str) -> int:
            found = re.search(r"\d+", label)
            return int(found.group()) if found else (1 if label.lower().startswith("just") else 10**9)
        sizes.sort(key=lambda r: (smallest(r["value"]), r["value"]))
        return {"industries": await counted(Tenant.industry), "sizes": sizes, "countries": await counted(Tenant.country),
                "business_types": await counted(Tenant.business_type), "heard_about": await counted(Tenant.heard_about),
                "plans": await counted(Tenant.subscription_plan)}

    async def admin_page(self, offset: int, limit: int, filters: dict) -> tuple[list[Tenant], int]:
        """Filter and sort before pagination, including aggregate user counts."""
        from sqlalchemy.orm import lazyload

        from app.modules.tenants.models import User

        conditions = self.admin_conditions(filters)
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
