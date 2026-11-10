"""Tenant-scoped storage and serialization points for discount usage."""

from sqlalchemy import func, or_, select

from app.core.repository import BaseRepository
from app.modules.discounts.models import AppliedDiscount, Coupon, DiscountRule, PromotionCampaign


class DiscountRepository(BaseRepository):
    model = DiscountRule

    async def lock(self, tenant_id):
        # Shares checkout's tenant lock: serializes settings, budgets and coupon/customer limits.
        from app.modules.sales.repository import OrderRepository

        await OrderRepository(self.db).lock_financial_writes(tenant_id)

    async def get_for_tenant(self, model, tenant_id, id):
        return (
            await self.db.execute(
                select(model).where(
                    model.tenant_id == tenant_id,
                    model.id == id,
                )
            )
        ).scalar_one_or_none()

    async def page(self, model, tenant_id, offset, limit, search=None, status=None, type_=None):
        filters = [model.tenant_id == tenant_id]
        if search:
            like = f"%{search}%"
            filters.append(or_(model.code.ilike(like), model.name.ilike(like)) if hasattr(model, "name") else model.code.ilike(like))
        if status == "current":  # everything except archived (the default list)
            filters.append(model.status != "Archived")
        elif status:
            filters.append(model.status == status)
        if type_ and hasattr(model, "type"):
            filters.append(model.type == type_)
        total = await self.db.scalar(select(func.count()).select_from(model).where(*filters))
        rows = (
            await self.db.scalars(
                select(model)
                .where(*filters)
                .order_by(
                    model.created_at.desc(),
                    model.id,
                )
                .offset(offset)
                .limit(limit)
            )
        ).all()
        return rows, total

    async def active_rules(self, tenant_id):
        return (
            await self.db.scalars(
                select(DiscountRule)
                .where(
                    DiscountRule.tenant_id == tenant_id,
                    DiscountRule.status == "Active",
                )
                .order_by(DiscountRule.priority.desc(), DiscountRule.id)
            )
        ).all()

    async def campaigns(self, tenant_id, ids):
        return (
            (
                await self.db.scalars(
                    select(PromotionCampaign).where(
                        PromotionCampaign.tenant_id == tenant_id,
                        PromotionCampaign.id.in_(ids),
                    )
                )
            ).all()
            if ids
            else []
        )

    async def coupons(self, tenant_id, codes, lock=True):
        if not codes:
            return []
        query = select(Coupon).where(Coupon.tenant_id == tenant_id, func.upper(Coupon.code).in_(codes)).order_by(Coupon.id)
        if lock:
            query = query.with_for_update()
        return (await self.db.scalars(query)).all()

    async def usage(self, tenant_id, customer_id, rule_ids=None):
        if rule_ids is not None and not rule_ids:
            return {}
        from app.modules.sales.models.order import Order

        rows = (
            await self.db.execute(
                select(
                    AppliedDiscount.rule_id,
                    func.count(),
                    func.count().filter(AppliedDiscount.customer_id == customer_id),
                )
                .join(Order, Order.id == AppliedDiscount.order_id)
                .where(
                    AppliedDiscount.tenant_id == tenant_id,
                    Order.tenant_id == tenant_id,
                    Order.status.notin_(["Cancelled", "Rejected"]),
                )
                .where(AppliedDiscount.rule_id.in_(rule_ids) if rule_ids is not None else True)
                .group_by(AppliedDiscount.rule_id)
            )
        ).all()
        return {str(r[0]): (r[1], r[2]) for r in rows}
