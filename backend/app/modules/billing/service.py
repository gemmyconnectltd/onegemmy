import hashlib
import json
import uuid
from datetime import UTC, datetime, timedelta

from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenError, ValidationError
from app.modules.audit.service import record_audit
from app.modules.billing.models import (
    BillingInvoice,
    BillingOperation,
    BillingPlan,
    BillingPrice,
    BillingQuote,
    BillingRefund,
    BillingSubscription,
)
from app.modules.billing.money import cost, next_period, proration
from app.modules.billing.repository import BillingRepository, serialize
from app.modules.billing.schemas import (
    BillingSettingsInput,
    ChangeRequest,
    PlanInput,
    SubscriptionAction,
)
from app.modules.tenants.models import User


def now_utc() -> datetime:
    return datetime.now(UTC)


def authorize(actor: User, action: str, platform: bool = False) -> uuid.UUID | None:
    if actor.tenant_id is None and actor.is_superuser and actor.role == "superadmin":
        return None
    if platform or actor.tenant_id is None:
        raise ForbiddenError("Platform administrator required")
    if not (actor.is_superuser or f"billing:{action}" in actor.permissions_names):
        raise ForbiddenError(f"Permission required: billing:{action}")
    return actor.tenant_id


async def audit(
    db: AsyncSession,
    actor: User | None,
    tenant_id: uuid.UUID | None,
    action: str,
    entity: object,
    changes: dict,
) -> None:
    await record_audit(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor.id if actor else None,
        actor_name=actor.full_name if actor else "Billing worker",
        action=f"billing.{action}",
        entity_type=entity.__tablename__,
        entity_id=str(entity.id),
        summary=f"Billing {action}",
        changes=jsonable_encoder(changes),
    )


async def notice(db: AsyncSession, tenant_id: uuid.UUID, key: str, subject: str, body: str) -> None:
    await BillingRepository(db).append_notice(tenant_id, key, subject, body, now_utc())


async def operation_start(
    repo: BillingRepository, scope: str, key: str, payload: dict
) -> tuple[dict | None, str]:
    if not key or len(key) > 100:
        raise ValidationError("An Idempotency-Key of at most 100 characters is required")
    fingerprint = hashlib.sha256(
        json.dumps(jsonable_encoder(payload), sort_keys=True).encode()
    ).hexdigest()
    old = await repo.operation(scope, key)
    if old:
        if old.fingerprint != fingerprint:
            raise ConflictError("Idempotency key was already used for a different request")
        return old.result, fingerprint
    return None, fingerprint


async def operation_end(
    db: AsyncSession, scope: str, key: str, fingerprint: str, result: dict
) -> dict:
    result = jsonable_encoder(result)
    db.add(BillingOperation(scope=scope, key=key, fingerprint=fingerprint, result=result))
    await db.commit()
    return result


async def save_plan(
    db: AsyncSession, actor: User, data: PlanInput, id: uuid.UUID | None, key: str
) -> dict:
    authorize(actor, "update", platform=True)
    repo = BillingRepository(db)
    scope = f"plan:{actor.id}"
    old, fp = await operation_start(repo, scope, key, {"id": id, **data.model_dump()})
    if old is not None:
        return old
    flags, currencies = await repo.catalog()
    for price in data.prices:
        if price.currency not in currencies:
            raise ValidationError("Use an active platform currency")
        if set(price.modules) - flags:
            raise ValidationError("Plan contains an unknown or inactive feature")
    if id:
        plan = await repo.plan(id, lock=True)
        if data.expected_version != plan.version:
            raise ConflictError("This plan changed. Reload before editing")
        before = serialize(plan)
        plan.version += 1
    else:
        plan = BillingPlan(version=1)
        db.add(plan)
        before = {}
    plan.name, plan.description, plan.status = data.name.strip(), data.description, data.status
    if not plan.name:
        raise ValidationError("Plan name is required")
    await db.flush()
    for p in data.prices:
        db.add(
            BillingPrice(
                plan_id=plan.id, version=plan.version, currency=p.currency, terms=p.model_dump()
            )
        )
    await db.flush()
    await audit(db, actor, None, "plan_saved", plan, {"before": before, "after": serialize(plan)})
    result = {
        **serialize(plan),
        "prices": [{"id": str(p.id), **p.terms} for p in await repo.prices(plan)],
    }
    return await operation_end(db, scope, key, fp, result)


async def preview_change(
    db: AsyncSession, actor: User, tenant_id: uuid.UUID, data: ChangeRequest
) -> dict:
    own = authorize(actor, "update")
    if own is not None and own != tenant_id:
        raise ForbiddenError("Cannot manage another company")
    repo = BillingRepository(db)
    await repo.tenant(tenant_id, lock=True)
    sub = await repo.subscription(tenant_id)
    if sub and sub.status in {"past_due", "suspended"}:
        raise ValidationError("Settle outstanding invoices before changing plans")
    if sub and await repo.pending_invoice(tenant_id):
        raise ValidationError("Settle outstanding invoices before changing plans")
    plan = await repo.plan(data.plan_id)
    if sub and sub.status not in {"canceled", "expired"} and sub.period_end <= now_utc():
        raise ValidationError(
            "Your billing period ended. Settle the renewal invoice before changing plans"
        )
    if plan.status != "active":
        raise ValidationError("This plan is not available")
    price = await repo.price(plan, data.currency)
    if sub and sub.currency != data.currency:
        raise ValidationError("Currency changes require a reviewed billing migration")
    usage = await repo.usage(tenant_id)
    validate_usage(price.terms, usage)
    now = now_utc()
    preserve_period = sub and sub.status not in {"canceled", "expired"} and sub.period_end > now
    end = (
        sub.period_end
        if preserve_period and (sub.cycle == data.cycle or sub.status == "trialing")
        else next_period(now, data.cycle)
    )
    amounts = cost(
        price.terms, data.cycle, usage["users"], usage["branches"], sub.discount_bps if sub else 0
    )
    trial = not sub and price.terms["trial_days"] > 0
    adjustment_tax = amounts["tax"]
    if sub and sub.status == "trialing":
        due = 0
        adjustment_tax = 0
    elif sub and sub.status not in {"canceled", "expired"}:
        if sub.cycle == data.cycle:
            due = proration(sub.recurring, amounts["total"], sub.period_start, end, now)
            old_tax = cost(sub.terms, sub.cycle, sub.seats, sub.branches, sub.discount_bps)["tax"]
            adjustment_tax = proration(old_tax, amounts["tax"], sub.period_start, end, now)
        else:
            due = amounts["total"] - proration(
                0, sub.recurring, sub.period_start, sub.period_end, now
            )
            old_tax = cost(sub.terms, sub.cycle, sub.seats, sub.branches, sub.discount_bps)["tax"]
            adjustment_tax = amounts["tax"] - proration(
                0, old_tax, sub.period_start, sub.period_end, now
            )
    else:
        due = 0 if trial else amounts["total"]
    if trial:
        end = now + timedelta(days=price.terms["trial_days"])
    credit = sub.credit if sub else 0
    preview = {
        "plan_name": plan.name,
        "price_id": str(price.id),
        "version": plan.version,
        "currency": price.currency,
        "cycle": data.cycle,
        "seats": usage["users"],
        "branches": usage["branches"],
        "recurring": amounts["total"],
        "subtotal": amounts["subtotal"],
        "tax": amounts["tax"],
        "discount": amounts["discount"],
        "adjustment": due,
        "adjustment_tax": adjustment_tax if due > 0 else 0,
        "credit_applied": min(credit, max(0, due)),
        "due_now": max(0, due - credit),
        "credit_added": max(0, -due),
        "effective_at": now.isoformat(),
        "period_end": end.isoformat(),
        "revision": sub.revision if sub else 0,
        "trial": trial,
    }
    quote = BillingQuote(
        tenant_id=tenant_id,
        actor_id=actor.id,
        request=data.model_dump(mode="json"),
        preview=preview,
        expires_at=now + timedelta(minutes=10),
    )
    db.add(quote)
    await db.commit()
    return {"quote_id": str(quote.id), "expires_at": quote.expires_at, **preview}


def validate_usage(terms: dict, usage: dict) -> None:
    for resource, field in (("users", "max_users"), ("branches", "max_branches")):
        maximum = terms.get(field)
        if maximum is not None and usage[resource] > maximum:
            raise ValidationError(f"Current {resource} exceed this plan's allowance")


async def sync_tenant(repo: BillingRepository, sub: BillingSubscription) -> None:
    tenant = await repo.tenant(sub.tenant_id)
    # Do not overwrite catalog/tenant overrides; entitlements intersect the immutable plan below.
    tenant.subscription_plan = str(sub.plan_id)
    tenant.subscription_status = sub.status


async def issue_invoice(
    db: AsyncSession,
    sub: BillingSubscription,
    amount: int,
    source: str,
    description: str,
    start: datetime,
    end: datetime,
    tax: int = 0,
) -> BillingInvoice | None:
    repo = BillingRepository(db)
    existing = await repo.invoice_source(source)
    if existing:
        return existing
    if amount == 0:
        return None
    credit_used = min(sub.credit, amount)
    sub.credit -= credit_used
    config = BillingSettingsInput.model_validate((await repo.settings()).data)
    tenant = await repo.tenant(sub.tenant_id)
    _, currencies = await repo.catalog()
    # Atomic global sequence, never reused. Gaps after rollback are intentional.
    seq = await repo.next_invoice_number()
    invoice = BillingInvoice(
        tenant_id=sub.tenant_id,
        subscription_id=sub.id,
        bill_to=tenant.name,
        currency_decimals=currencies[sub.currency],
        number=f"{config.invoice_prefix}-{seq:09d}",
        source_key=source,
        currency=sub.currency,
        period_start=start,
        period_end=end,
        due_at=now_utc() + timedelta(days=config.due_days),
        lines=[{"description": description, "amount": amount, "credit_applied": credit_used}],
        subtotal=amount - tax,
        tax=tax,
        total=amount,
        paid=credit_used,
        status="paid" if credit_used == amount else "partially_paid" if credit_used else "open",
    )
    db.add(invoice)
    await db.flush()
    await notice(
        db,
        sub.tenant_id,
        f"invoice:{invoice.id}",
        "Your Pesaa invoice is ready",
        f"Invoice {invoice.number} is ready. View and pay it in Settings → Plans & Billing.",
    )
    return invoice


async def confirm_change(
    db: AsyncSession, actor: User, tenant_id: uuid.UUID, quote_id: uuid.UUID, key: str
) -> dict:
    own = authorize(actor, "update")
    if own is not None and own != tenant_id:
        raise ForbiddenError("Cannot manage another company")
    repo = BillingRepository(db)
    scope = f"change:{tenant_id}:{actor.id}"
    old, fp = await operation_start(repo, scope, key, {"quote_id": quote_id})
    if old is not None:
        return old
    await repo.tenant(tenant_id, lock=True)
    quote = await repo.scoped(BillingQuote, tenant_id, quote_id, lock=True)
    if quote.actor_id != actor.id or quote.consumed or quote.expires_at < now_utc():
        raise ConflictError("Quote expired or was already used; request a new preview")
    sub = await repo.subscription(tenant_id)
    if (sub.revision if sub else 0) != quote.preview["revision"]:
        raise ConflictError("Subscription changed; request a new preview")
    plan = await repo.plan(uuid.UUID(quote.request["plan_id"]), lock=True)
    price = await repo.price(plan, quote.request["currency"])
    if plan.status != "active" or str(price.id) != quote.preview["price_id"]:
        raise ConflictError("Plan changed; request a new preview")
    usage = await repo.usage(tenant_id)
    if usage != {"users": quote.preview["seats"], "branches": quote.preview["branches"]}:
        raise ConflictError("Usage changed; request a new preview")
    if sub and await repo.pending_invoice(tenant_id):
        raise ConflictError("An outstanding invoice must be settled first")
    before = serialize(sub) if sub else {}
    new = sub is None
    if new:
        sub = BillingSubscription(tenant_id=tenant_id, discount_bps=0, credit=0, revision=0)
        db.add(sub)
    p = quote.preview
    sub.plan_id, sub.price_id, sub.terms = plan.id, price.id, price.terms
    sub.currency, sub.cycle = price.currency, quote.request["cycle"]
    sub.seats, sub.branches, sub.recurring = p["seats"], p["branches"], p["recurring"]
    sub.recurring_net = p["subtotal"]
    if (
        new
        or (before["cycle"] != sub.cycle and before["status"] != "trialing")
        or before.get("status") in {"canceled", "expired"}
    ):
        sub.period_start = datetime.fromisoformat(p["effective_at"])
        sub.billing_anchor_day = (
            datetime.fromisoformat(p["period_end"]).day if p["trial"] else sub.period_start.day
        )
    sub.period_end = datetime.fromisoformat(p["period_end"])
    sub.trial_end = sub.period_end if p["trial"] else (sub.trial_end if not new else None)
    sub.status = (
        "trialing" if p["trial"] or (not new and before["status"] == "trialing") else "active"
    )
    sub.cancel_at_end = False
    sub.credit += p["credit_added"]
    sub.revision += 1
    quote.consumed = True
    await db.flush()
    invoice = await issue_invoice(
        db,
        sub,
        max(0, p["adjustment"]),
        f"change:{quote.id}",
        f"Plan change to {plan.name}",
        sub.period_start,
        sub.period_end,
        p["adjustment_tax"],
    )
    if invoice and invoice.status != "paid":
        sub.status = "past_due"  # Paid access begins only after verified settlement.
    await sync_tenant(repo, sub)
    await audit(
        db,
        actor,
        tenant_id,
        "plan_changed",
        sub,
        {"before": before, "after": serialize(sub), "quote": p},
    )
    await notice(
        db,
        tenant_id,
        f"change:{quote.id}",
        "Your Pesaa plan changed",
        "Your plan change has been recorded. Review your subscription in Plans & Billing.",
    )
    return await operation_end(
        db,
        scope,
        key,
        fp,
        {"subscription": serialize(sub), "invoice": serialize(invoice) if invoice else None},
    )


async def subscription_action(
    db: AsyncSession, actor: User, tenant_id: uuid.UUID, data: SubscriptionAction, key: str
) -> dict:
    own = authorize(actor, "update")
    if own is not None and own != tenant_id:
        raise ForbiddenError("Cannot manage another company")
    if data.action in {"extend_trial", "discount"}:
        authorize(actor, "update", platform=True)
    repo = BillingRepository(db)
    scope = f"action:{tenant_id}:{actor.id}"
    old, fp = await operation_start(repo, scope, key, data.model_dump())
    if old is not None:
        return old
    await repo.tenant(tenant_id, lock=True)
    sub = await repo.subscription(tenant_id)
    if sub is None:
        raise ValidationError("No subscription to manage")
    before = serialize(sub)
    if data.action == "cancel":
        sub.cancel_at_end = data.at_period_end
        if not data.at_period_end:
            sub.status = "canceled"
    elif data.action == "reactivate":
        if sub.status in {"canceled", "expired", "suspended"}:
            raise ValidationError(
                "Choose a plan to restart a subscription; outstanding invoices remain due"
            )
        sub.cancel_at_end = False
    elif data.action == "extend_trial":
        if sub.status != "trialing" or not data.days:
            raise ValidationError("Only an existing trial can be extended")
        sub.trial_end = max(sub.period_end, now_utc()) + timedelta(days=data.days)
        sub.period_end = sub.trial_end
    elif data.action == "discount":
        # Discounts apply prospectively to subsequent invoices, never finalized records.
        if sub.status == "trialing":
            sub.discount_bps = data.discount_bps
            amounts = cost(sub.terms, sub.cycle, sub.seats, sub.branches, sub.discount_bps)
            sub.recurring = amounts["total"]
            sub.recurring_net = amounts["subtotal"]
        else:
            sub.next_discount_bps = data.discount_bps
    sub.revision += 1
    await sync_tenant(repo, sub)
    await audit(
        db,
        actor,
        tenant_id,
        data.action,
        sub,
        {"before": before, "after": serialize(sub), "reason": data.reason},
    )
    await notice(
        db,
        tenant_id,
        f"action:{sub.id}:{sub.revision}",
        "Your Pesaa subscription was updated",
        f"Subscription action: {data.action}. Review your subscription in Plans & Billing.",
    )
    return await operation_end(db, scope, key, fp, serialize(sub))


async def overview(db: AsyncSession, actor: User, tenant_id: uuid.UUID) -> dict:
    own = authorize(actor, "read")
    if own is not None and own != tenant_id:
        raise ForbiddenError("Cannot view another company")
    repo = BillingRepository(db)
    tenant = await repo.tenant(tenant_id)
    sub = await repo.subscription(tenant_id)
    policy = BillingSettingsInput.model_validate((await repo.settings()).data)
    enrollment_required = sub is None and tenant.billing_required and policy.require_new_businesses
    return {
        "subscription": serialize(sub) if sub else None,
        "enrollment_required": enrollment_required,
        "legacy_plan": tenant.subscription_plan if not sub and not enrollment_required else None,
        "plan_name": (await repo.plan(sub.plan_id)).name if sub else None,
        "usage": await repo.usage(tenant_id),
        "outstanding": await repo.outstanding(tenant_id),
    }


async def list_records(
    db: AsyncSession,
    actor: User,
    kind: str,
    page: int,
    page_size: int,
    filters: dict,
    platform: bool,
) -> tuple[list[dict], int]:
    own = authorize(actor, "read", platform=platform)
    return await BillingRepository(db).list_records(
        kind,
        (page - 1) * page_size,
        min(page_size, 100),
        own,
        filters,
        tenant_catalog=not platform and kind == "plans",
    )


async def get_settings(db: AsyncSession, actor: User) -> dict:
    authorize(actor, "read", platform=True)
    return BillingSettingsInput.model_validate(
        (await BillingRepository(db).settings()).data
    ).model_dump()


async def save_settings(db: AsyncSession, actor: User, data: BillingSettingsInput) -> dict:
    authorize(actor, "update", platform=True)
    row = await BillingRepository(db).settings(lock=True)
    before = dict(row.data)
    row.data = data.model_dump()
    await audit(db, actor, None, "settings_updated", row, {"before": before, "after": row.data})
    await db.commit()
    return row.data


async def detail(
    db: AsyncSession, actor: User, kind: str, id: uuid.UUID, platform: bool = False
) -> dict:
    own = authorize(actor, "read", platform=platform)
    repo = BillingRepository(db)
    if kind == "plans":
        plan = await repo.plan(id)
        if own is not None and plan.status != "active":
            raise ValidationError("Plan unavailable")
        return {
            **serialize(plan),
            "prices": [{"id": str(p.id), **p.terms} for p in await repo.prices(plan)],
        }
    model = {
        "invoices": BillingInvoice,
        "subscriptions": BillingSubscription,
        "refunds": BillingRefund,
    }[kind]
    if own is None:
        record = await repo.global_record(model, id)
    else:
        record = await repo.scoped(model, own, id)
    tenant = await repo.tenant(record.tenant_id)
    return {**serialize(record), "tenant_name": getattr(record, "bill_to", tenant.name)}


async def billing_report(
    db: AsyncSession, actor: User, currency: str, plan_id: str, status: str, start=None, end=None
) -> dict:
    authorize(actor, "read", platform=True)
    from app.modules.billing.repository import daily_report

    end = end or now_utc().date()
    start = start or end.replace(day=1)
    if start > end or (end - start).days > 366:
        raise ValidationError("Select a date range of at most 366 days")
    if plan_id:
        try:
            uuid.UUID(plan_id)
        except ValueError as exc:
            raise ValidationError("Invalid plan ID") from exc
    report = await BillingRepository(db).report("overview")
    if report is None:
        return {"updated_at": None, "subscriptions": [], "outstanding": [], "payments": []}
    subs = [
        r
        for r in report.data["subscriptions"]
        if (not currency or r["currency"] == currency)
        and (not plan_id or r["plan_id"] == plan_id)
        and (not status or r["status"] == status)
    ]
    financials = await daily_report(db, start, end, currency, plan_id, status)
    return {"updated_at": report.updated_at, "subscriptions": subs, **financials}
