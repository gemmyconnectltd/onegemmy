import hashlib
import uuid
from datetime import datetime

from sqlalchemy import func, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import lazyload

from app.core.exceptions import NotFoundError
from app.core.repository import BaseRepository
from app.modules.billing.models import (
    BillingInvoice,
    BillingNotice,
    BillingOperation,
    BillingPayment,
    BillingPlan,
    BillingPrice,
    BillingRefund,
    BillingReport,
    BillingSetting,
    BillingSubscription,
)
from app.modules.currency.models import Currency
from app.modules.tenants.models import Branch, FeatureFlag, Tenant, User


class BillingRepository(BaseRepository):
    model = BillingSubscription

    async def lock(self, scope: str) -> None:
        key = int.from_bytes(hashlib.sha256(scope.encode()).digest()[:8], signed=True)
        await self.db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})

    async def append_notice(
        self, tenant_id: uuid.UUID, key: str, subject: str, body: str, now: datetime
    ) -> None:
        await self.db.execute(
            insert(BillingNotice)
            .values(
                id=uuid.uuid4(),
                tenant_id=tenant_id,
                event_key=key,
                subject=subject,
                body=body,
                available_at=now,
                attempts=0,
            )
            .on_conflict_do_nothing(index_elements=["event_key"])
        )

    async def next_invoice_number(self) -> int:
        return await self.db.scalar(text("SELECT nextval('billing_invoice_number_seq')"))

    async def global_record(self, model: type, id: uuid.UUID) -> object:
        row = await self.db.get(model, id)
        if row is None:
            raise NotFoundError("Billing record not found")
        return row

    async def has_history(self, tenant_id: uuid.UUID) -> bool:
        from app.modules.billing.models import BillingQuote

        for model in (BillingSubscription, BillingQuote):
            if await self.db.scalar(select(model.id).where(model.tenant_id == tenant_id).limit(1)):
                return True
        return False

    async def tenant(self, tenant_id: uuid.UUID, lock: bool = False) -> Tenant:
        stmt = select(Tenant).options(lazyload("*")).where(Tenant.id == tenant_id)
        if lock:
            stmt = stmt.with_for_update()
        row = (
            await self.db.execute(stmt.execution_options(populate_existing=True))
        ).scalar_one_or_none()
        if row is None:
            raise NotFoundError("Company not found")
        return row

    async def subscription(self, tenant_id: uuid.UUID) -> BillingSubscription | None:
        return (
            await self.db.execute(
                select(BillingSubscription)
                .where(BillingSubscription.tenant_id == tenant_id)
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()

    async def scoped(
        self, model: type, tenant_id: uuid.UUID, id: uuid.UUID, lock: bool = False
    ) -> object:
        stmt = select(model).where(model.tenant_id == tenant_id, model.id == id)
        if lock:
            stmt = stmt.with_for_update()
        row = (
            await self.db.execute(stmt.execution_options(populate_existing=True))
        ).scalar_one_or_none()
        if row is None:
            raise NotFoundError("Billing record not found")
        return row

    async def plan(self, id: uuid.UUID, lock: bool = False) -> BillingPlan:
        stmt = select(BillingPlan).where(BillingPlan.id == id)
        if lock:
            stmt = stmt.with_for_update()
        row = (
            await self.db.execute(stmt.execution_options(populate_existing=True))
        ).scalar_one_or_none()
        if row is None:
            raise NotFoundError("Plan not found")
        return row

    async def prices(self, plan: BillingPlan) -> list[BillingPrice]:
        return list(
            (
                await self.db.scalars(
                    select(BillingPrice)
                    .where(BillingPrice.plan_id == plan.id, BillingPrice.version == plan.version)
                    .order_by(BillingPrice.currency)
                )
            ).all()
        )

    async def price(self, plan: BillingPlan, currency: str) -> BillingPrice:
        row = (
            await self.db.execute(
                select(BillingPrice).where(
                    BillingPrice.plan_id == plan.id,
                    BillingPrice.version == plan.version,
                    BillingPrice.currency == currency,
                )
            )
        ).scalar_one_or_none()
        if row is None:
            raise NotFoundError("Plan is not priced in this currency")
        return row

    async def catalog(self) -> tuple[set[str], dict[str, int]]:
        flags = set(
            (
                await self.db.scalars(
                    select(FeatureFlag.key).where(FeatureFlag.is_active.is_(True))
                )
            ).all()
        )
        rows = (
            await self.db.execute(
                select(Currency.code, Currency.decimal_places).where(Currency.is_active.is_(True))
            )
        ).all()
        return flags, {r.code: r.decimal_places for r in rows}

    async def usage(self, tenant_id: uuid.UUID) -> dict:
        users = await self.db.scalar(
            select(func.count(User.id)).where(User.tenant_id == tenant_id, User.is_active.is_(True))
        )
        branches = await self.db.scalar(
            select(func.count(Branch.id)).where(
                Branch.tenant_id == tenant_id, Branch.status == "active"
            )
        )
        return {"users": users or 0, "branches": branches or 0}

    async def settings(self, lock: bool = False) -> BillingSetting:
        await self.lock("billing-settings")
        row = await self.db.get(BillingSetting, 1, populate_existing=True)
        if row is None:
            row = BillingSetting(id=1, data={})
            self.db.add(row)
            await self.db.flush()
        return row

    async def operation(self, scope: str, key: str) -> BillingOperation | None:
        await self.lock(f"billing-op:{scope}:{key}")
        return (
            await self.db.execute(
                select(BillingOperation).where(
                    BillingOperation.scope == scope, BillingOperation.key == key
                )
            )
        ).scalar_one_or_none()

    async def outstanding(self, tenant_id: uuid.UUID) -> list[dict]:
        rows = (
            await self.db.execute(
                select(
                    BillingInvoice.currency, func.sum(BillingInvoice.total - BillingInvoice.paid)
                )
                .where(
                    BillingInvoice.tenant_id == tenant_id,
                    BillingInvoice.status.in_(["open", "partially_paid", "overdue"]),
                )
                .group_by(BillingInvoice.currency)
            )
        ).all()
        return [{"currency": c, "amount": int(n)} for c, n in rows]

    async def mark_overdue(self, tenant_id: uuid.UUID, now: datetime) -> int:
        result = await self.db.execute(
            update(BillingInvoice)
            .where(
                BillingInvoice.tenant_id == tenant_id,
                BillingInvoice.due_at < now,
                BillingInvoice.status.in_(["open", "partially_paid"]),
            )
            .values(status="overdue")
        )
        return result.rowcount

    async def first_unpaid(self, tenant_id: uuid.UUID) -> BillingInvoice | None:
        return (
            await self.db.execute(
                select(BillingInvoice)
                .where(
                    BillingInvoice.tenant_id == tenant_id,
                    BillingInvoice.status.in_(["open", "partially_paid", "overdue"]),
                )
                .order_by(BillingInvoice.due_at)
                .limit(1)
            )
        ).scalar_one_or_none()

    async def pending_invoice(self, tenant_id: uuid.UUID) -> bool:
        return bool(
            await self.db.scalar(
                select(BillingInvoice.id)
                .where(
                    BillingInvoice.tenant_id == tenant_id,
                    BillingInvoice.status.in_(["open", "partially_paid", "overdue"]),
                )
                .limit(1)
            )
        )

    async def invoice_source(self, key: str) -> BillingInvoice | None:
        return (
            await self.db.execute(select(BillingInvoice).where(BillingInvoice.source_key == key))
        ).scalar_one_or_none()

    async def payment_reference(
        self, reference: uuid.UUID, tenant_id: uuid.UUID | None = None
    ) -> BillingPayment | None:
        stmt = select(BillingPayment).where(BillingPayment.reference == reference)
        if tenant_id is not None:
            stmt = stmt.where(BillingPayment.tenant_id == tenant_id)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def payment_in_flight(self, invoice_id: uuid.UUID) -> BillingPayment | None:
        return (
            await self.db.execute(
                select(BillingPayment)
                .where(
                    BillingPayment.invoice_id == invoice_id,
                    BillingPayment.status.in_(["pending", "processing"]),
                )
                .limit(1)
            )
        ).scalar_one_or_none()

    async def list_records(
        self,
        kind: str,
        offset: int,
        limit: int,
        tenant_id: uuid.UUID | None,
        filters: dict,
        tenant_catalog: bool = False,
    ) -> tuple[list[dict], int]:
        model = {
            "plans": BillingPlan,
            "subscriptions": BillingSubscription,
            "invoices": BillingInvoice,
            "payments": BillingPayment,
            "refunds": BillingRefund,
        }[kind]
        conditions = []
        if tenant_id is not None and kind != "plans":
            conditions.append(model.tenant_id == tenant_id)
        if tenant_catalog:
            conditions.append(BillingPlan.status == "active")
        for name in ("status", "currency", "plan_id", "invoice_id", "tenant_id", "payment_id"):
            value = filters.get(name)
            if value and hasattr(model, name):
                conditions.append(getattr(model, name) == value)
        for name, op in (("from_date", "ge"), ("to_date", "le")):
            if filters.get(name):
                conditions.append(
                    model.created_at >= filters[name]
                    if op == "ge"
                    else model.created_at <= filters[name]
                )
        if kind == "plans" and filters.get("currency"):
            conditions.append(
                select(BillingPrice.id)
                .where(
                    BillingPrice.plan_id == BillingPlan.id,
                    BillingPrice.version == BillingPlan.version,
                    BillingPrice.currency == filters["currency"],
                )
                .exists()
            )
        stmt = select(model)
        total_stmt = select(func.count()).select_from(model)
        if kind != "plans":
            stmt = select(model, Tenant.name).join(Tenant, Tenant.id == model.tenant_id)
            total_stmt = total_stmt.join(Tenant, Tenant.id == model.tenant_id)
        if kind == "subscriptions":
            stmt = (
                select(model, Tenant.name, BillingPlan.name)
                .join(Tenant, Tenant.id == model.tenant_id)
                .join(BillingPlan, BillingPlan.id == model.plan_id)
            )
        if filters.get("q"):
            col = BillingPlan.name if kind == "plans" else Tenant.name
            conditions.append(col.ilike(f"%{filters['q']}%"))
        total = int(await self.db.scalar(total_stmt.where(*conditions)) or 0)
        rows = (
            await self.db.execute(
                stmt.where(*conditions)
                .order_by(model.created_at.desc(), model.id)
                .offset(offset)
                .limit(min(limit, 100))
            )
        ).all()
        result = []
        # Batch-load current price rows for the current page only.
        prices_by_plan: dict = {}
        if kind == "plans" and rows:
            prices = (
                await self.db.scalars(
                    select(BillingPrice)
                    .join(
                        BillingPlan,
                        (BillingPrice.plan_id == BillingPlan.id)
                        & (BillingPrice.version == BillingPlan.version),
                    )
                    .where(BillingPrice.plan_id.in_([r[0].id for r in rows]))
                )
            ).all()
            for p in prices:
                prices_by_plan.setdefault(p.plan_id, []).append(
                    {"id": str(p.id), "version": p.version, **p.terms}
                )
        for row in rows:
            item = serialize(row[0])
            if kind == "plans":
                item["prices"] = prices_by_plan.get(row[0].id, [])
            else:
                item["tenant_name"] = row[1]
                if kind == "subscriptions":
                    item["plan_name"] = row[2]
            result.append(item)
        return result, total

    async def due_subscriptions(self, now: datetime, limit: int = 100) -> list[BillingSubscription]:
        return list(
            (
                await self.db.scalars(
                    select(BillingSubscription)
                    .where(
                        BillingSubscription.period_end <= now,
                        BillingSubscription.status.in_(["active", "trialing", "past_due"]),
                    )
                    .order_by(BillingSubscription.period_end)
                    .limit(limit)
                )
            ).all()
        )

    async def pending_payments(self, limit: int = 100) -> list[BillingPayment]:
        return list(
            (
                await self.db.scalars(
                    select(BillingPayment)
                    .where(BillingPayment.status.in_(["pending", "processing"]))
                    .order_by(BillingPayment.updated_at)
                    .limit(limit)
                )
            ).all()
        )

    async def notices(self, now: datetime) -> list[BillingNotice]:
        return list(
            (
                await self.db.scalars(
                    select(BillingNotice)
                    .where(
                        BillingNotice.sent_at.is_(None),
                        BillingNotice.available_at <= now,
                        BillingNotice.attempts < 10,
                    )
                    .order_by(BillingNotice.available_at)
                    .limit(50)
                    .with_for_update(skip_locked=True)
                )
            ).all()
        )

    async def owner_emails(self, tenant_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
        if not tenant_ids:
            return {}
        rows = (
            await self.db.execute(
                select(User.tenant_id, User.email)
                .where(
                    User.tenant_id.in_(tenant_ids),
                    User.is_active.is_(True),
                    User.role == "owner",
                )
                .distinct(User.tenant_id)
                .order_by(User.tenant_id, User.created_at, User.id)
            )
        ).all()
        return {tenant_id: email for tenant_id, email in rows}

    async def report(self, key: str) -> BillingReport | None:
        return await self.db.get(BillingReport, key)

    async def price_history(self, plan_id: uuid.UUID, offset: int, limit: int) -> tuple[list, int]:
        total = await self.db.scalar(
            select(func.count()).select_from(BillingPrice).where(BillingPrice.plan_id == plan_id)
        )
        rows = (
            await self.db.scalars(
                select(BillingPrice)
                .where(BillingPrice.plan_id == plan_id)
                .order_by(BillingPrice.version.desc())
                .offset(offset)
                .limit(limit)
            )
        ).all()
        return [serialize(r) for r in rows], total or 0


def serialize(row: object) -> dict:
    return {
        c.name: getattr(row, c.name) for c in row.__table__.columns if c.name != "provider_payload"
    }


async def subscription_batch(
    db: AsyncSession, after: uuid.UUID | None
) -> list[BillingSubscription]:
    stmt = select(BillingSubscription).order_by(BillingSubscription.id).limit(100)
    if after:
        stmt = stmt.where(BillingSubscription.id > after)
    return list((await db.scalars(stmt)).all())


async def report_totals(db: AsyncSession) -> list[dict]:
    # Worker-only aggregation. Requests read the persisted results, never scan the ledger.
    from decimal import Decimal

    from app.modules.billing.money import rounded

    rows = (
        await db.execute(
            select(
                BillingSubscription.currency,
                BillingSubscription.plan_id,
                BillingSubscription.status,
                BillingSubscription.cycle,
                func.count(),
                func.sum(BillingSubscription.recurring_net),
            ).group_by(
                BillingSubscription.currency,
                BillingSubscription.plan_id,
                BillingSubscription.status,
                BillingSubscription.cycle,
            )
        )
    ).all()
    result = []
    for currency, plan, status, cycle, count, amount in rows:
        mrr = (
            rounded(Decimal(amount) / (12 if cycle == "annual" else 1)) if status == "active" else 0
        )
        result.append(
            {
                "currency": currency,
                "plan_id": str(plan),
                "status": status,
                "subscriptions": count,
                "mrr": mrr,
            }
        )
    return result


async def subscription_history(
    db: AsyncSession, tenant_id: uuid.UUID, subscription_id: uuid.UUID, offset: int, limit: int
) -> tuple[list, int]:
    from app.modules.audit.models import AuditLog

    criteria = (
        AuditLog.tenant_id == tenant_id,
        AuditLog.entity_type == "billing_subscriptions",
        AuditLog.entity_id == str(subscription_id),
    )
    total = await db.scalar(select(func.count()).select_from(AuditLog).where(*criteria))
    rows = (
        await db.scalars(
            select(AuditLog)
            .where(*criteria)
            .order_by(AuditLog.created_at.desc())
            .offset(offset)
            .limit(min(limit, 100))
        )
    ).all()
    return [serialize(r) for r in rows], total or 0


async def rebuild_daily(db: AsyncSession) -> None:
    from sqlalchemy import delete

    from app.modules.billing.models import BillingDaily

    day_i = func.date(func.timezone("UTC", BillingInvoice.created_at))
    day_p = func.date(func.timezone("UTC", BillingPayment.created_at))
    invoice_rows = (
        await db.execute(
            select(
                day_i,
                BillingInvoice.currency,
                BillingSubscription.plan_id,
                BillingSubscription.status,
                func.count(),
                func.sum(BillingInvoice.total - BillingInvoice.paid),
            )
            .join(BillingSubscription, BillingSubscription.id == BillingInvoice.subscription_id)
            .where(BillingInvoice.status.in_(["open", "overdue", "partially_paid"]))
            .group_by(
                day_i,
                BillingInvoice.currency,
                BillingSubscription.plan_id,
                BillingSubscription.status,
            )
        )
    ).all()
    payments = (
        await db.execute(
            select(
                day_p,
                BillingPayment.currency,
                BillingSubscription.plan_id,
                BillingSubscription.status,
                BillingPayment.status,
                func.count(),
                func.sum(BillingPayment.amount),
            )
            .join(BillingInvoice, BillingInvoice.id == BillingPayment.invoice_id)
            .join(BillingSubscription, BillingSubscription.id == BillingInvoice.subscription_id)
            .where(BillingPayment.status.in_(["succeeded", "failed"]))
            .group_by(
                day_p,
                BillingPayment.currency,
                BillingSubscription.plan_id,
                BillingSubscription.status,
                BillingPayment.status,
            )
        )
    ).all()
    rows = {}

    def get(day, currency, plan, status):
        return rows.setdefault(
            (day, currency, plan, status),
            {
                "day": day,
                "currency": currency,
                "plan_id": plan,
                "subscription_status": status,
                "invoice_count": 0,
                "outstanding": 0,
                "successful_payments": 0,
                "failed_payments": 0,
                "successful_amount": 0,
            },
        )

    for day, currency, plan, status, count, amount in invoice_rows:
        row = get(day, currency, plan, status)
        row["invoice_count"], row["outstanding"] = count, int(amount)
    for day, currency, plan, status, outcome, count, amount in payments:
        row = get(day, currency, plan, status)
        row["successful_payments" if outcome == "succeeded" else "failed_payments"] = count
        if outcome == "succeeded":
            row["successful_amount"] = int(amount)
    await db.execute(delete(BillingDaily))
    data = list(rows.values())
    for start in range(0, len(data), 100):
        await db.execute(insert(BillingDaily), data[start : start + 100])


async def daily_report(
    db: AsyncSession, start, end, currency: str, plan_id: str, status: str
) -> dict:
    from app.modules.billing.models import BillingDaily

    conditions = [BillingDaily.day >= start, BillingDaily.day <= end]
    if currency:
        conditions.append(BillingDaily.currency == currency)
    if plan_id:
        conditions.append(BillingDaily.plan_id == uuid.UUID(plan_id))
    if status:
        conditions.append(BillingDaily.subscription_status == status)
    rows = (
        await db.execute(
            select(
                BillingDaily.currency,
                func.sum(BillingDaily.invoice_count),
                func.sum(BillingDaily.outstanding),
                func.sum(BillingDaily.successful_payments),
                func.sum(BillingDaily.failed_payments),
                func.sum(BillingDaily.successful_amount),
            )
            .where(*conditions)
            .group_by(BillingDaily.currency)
        )
    ).all()
    return {
        "outstanding": [
            {"currency": c, "count": int(n), "amount": int(a)} for c, n, a, _, _, _ in rows
        ],
        "payments": [
            item
            for c, _, _, success, failed, amount in rows
            for item in [
                {
                    "currency": c,
                    "status": "succeeded",
                    "count": int(success),
                    "amount": int(amount),
                },
                {"currency": c, "status": "failed", "count": int(failed), "amount": 0},
            ]
        ],
    }


async def refund_reserved(db: AsyncSession, payment_id: uuid.UUID) -> int:
    from app.modules.billing.models import BillingRefund

    return int(
        await db.scalar(
            select(func.sum(BillingRefund.amount)).where(
                BillingRefund.payment_id == payment_id,
                BillingRefund.status.in_(["pending", "processing", "succeeded"]),
            )
        )
        or 0
    )


async def refund_reference(db: AsyncSession, reference: uuid.UUID):
    from app.modules.billing.models import BillingRefund

    return (
        await db.execute(select(BillingRefund).where(BillingRefund.reference == reference))
    ).scalar_one_or_none()


async def pending_refunds(db: AsyncSession) -> list:
    from app.modules.billing.models import BillingRefund

    return list(
        (
            await db.scalars(
                select(BillingRefund)
                .where(BillingRefund.status.in_(["pending", "processing"]))
                .order_by(BillingRefund.updated_at)
                .limit(100)
            )
        ).all()
    )


async def refund_tax_to_date(db: AsyncSession, invoice_id: uuid.UUID) -> tuple[int, int]:
    from app.modules.billing.models import BillingRefund

    row = (
        await db.execute(
            select(
                func.coalesce(func.sum(BillingRefund.amount), 0),
                func.coalesce(func.sum(BillingRefund.document["tax"].as_integer()), 0),
            )
            .join(BillingPayment, BillingPayment.id == BillingRefund.payment_id)
            .where(
                BillingPayment.invoice_id == invoice_id,
                BillingRefund.status.in_(["pending", "processing", "succeeded"]),
            )
        )
    ).one()
    return int(row[0]), int(row[1])
