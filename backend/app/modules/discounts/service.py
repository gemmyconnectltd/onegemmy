"""Pricing and checkout for discounts and promotions, on top of the shared engine.

`quote` prices a cart from the rules on file; `validate_checkout` is what a sale is charged (it refuses what the person may not do and checks any approval against
the sale it was given for); `record_sale` freezes what was given with the sale and uses up coupons; `release_coupon_usage` gives a coupon back when a sale is cancelled.
Nothing here trusts a discount amount or an approval that came from a screen.
"""
import hashlib
import json
import uuid
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select

from app.core.exceptions import (
    ApprovalRequiredError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from app.modules.approvals.models import ApprovalRequest
from app.modules.discounts import engine, settings
from app.modules.discounts.models import (
    AppliedDiscount,
    Coupon,
    CouponRedemption,
    DiscountRule,
    PromotionCampaign,
)
from app.modules.discounts.repository import DiscountRepository
from app.modules.discounts.schemas import PriceIn
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.variant import ProductVariant
from app.modules.sales.models.customer import Customer
from app.modules.tenants.models import Tenant


def aware(value: datetime | None) -> datetime | None:
    return None if value is None else (value if value.tzinfo else value.replace(tzinfo=UTC))


async def require_enabled(db, user, feature: str = "enabled") -> dict:
    """The business's discount settings, or a refusal when the switch for this feature is off."""
    config = await settings.load(db, user.tenant_id)
    if not settings.effective(config).get(feature):
        label = settings.LABELS.get(feature, "Discount Management")
        raise ForbiddenError(f"“{label}” is switched off for this business. Turn it on in Settings → Sales → Discounts & Promotions.")
    return config


async def _now(db, tenant_id: uuid.UUID) -> datetime:
    zone = (await db.execute(select(Tenant.timezone).where(Tenant.id == tenant_id))).scalar_one_or_none() or "UTC"
    try:
        return datetime.now(ZoneInfo(zone))
    except Exception:  # noqa: BLE001 - a bad stored zone must not stop a sale
        return datetime.now(UTC)


def pricing_hash(result: engine.Result) -> str:
    """A fingerprint of the whole priced cart: a screen that charged a different price than the server now computes is refused."""
    return hashlib.sha256(json.dumps(result.dump(), sort_keys=True, default=str).encode()).hexdigest()


async def _lines(db, tenant_id: uuid.UUID, data: PriceIn) -> list[engine.Line]:
    variant_ids = [i.variant_id for i in data.items if i.variant_id]
    variants = {v.id: v for v in (await db.execute(select(ProductVariant).where(ProductVariant.id.in_(variant_ids)))).scalars().all()} if variant_ids else {}
    product_ids = {i.product_id for i in data.items if i.product_id} | {v.product_id for v in variants.values()}
    products = {p.id: p for p in (await db.execute(select(Product).where(Product.tenant_id == tenant_id, Product.id.in_(product_ids)))).scalars().all()} if product_ids else {}
    lines = []
    for index, item in enumerate(data.items):
        variant = variants.get(item.variant_id) if item.variant_id else None
        if item.variant_id and variant is None:
            raise ValidationError("A variant in the cart was not found")
        product = products.get(variant.product_id if variant else item.product_id)
        if (item.product_id or item.variant_id) and product is None:
            raise ValidationError("A product in the cart was not found in this business")
        cost = engine.D(variant.cost if variant is not None else product.cost) if product is not None else None
        unit_cost = engine.D(variant.cost if variant is not None else product.cost) if product is not None else engine.D(0)
        if data.channel == "pos" and engine.D(item.unit_price) < unit_cost:
            raise ValidationError("The selling price cannot be below unit cost")
        lines.append(engine.Line(str(index), engine.D(item.unit_price), engine.D(item.quantity), product_id=str(product.id) if product else None,
                                 category_id=str(product.category_id) if product is not None and product.category_id else None, cost=cost,
                                 variant_id=str(variant.id) if variant else None))
    return lines


def _campaign_live(c: PromotionCampaign, now: datetime) -> bool:
    if c.status not in ("Scheduled", "Active"):
        return False
    return not ((c.starts_at and now < aware(c.starts_at)) or (c.ends_at and now >= aware(c.ends_at)))


def _engine_rule(r: DiscountRule, camp: PromotionCampaign | None) -> engine.Rule:
    config = {**(r.config or {})}
    if camp is not None:  # a campaign's branches and target customers apply to every rule in it that does not set its own
        scope = dict(config.get("scope") or {})
        if camp.branch_ids and not scope.get("branch_ids"):
            scope["branch_ids"] = camp.branch_ids
        target = camp.target or {}
        if target.get("customer_ids") and not scope.get("customer_ids"):
            scope["customer_ids"] = target["customer_ids"]
        if target.get("customer_types") and not scope.get("customer_types"):
            scope["customer_types"] = target["customer_types"]
        config["scope"] = scope
    return engine.Rule(id=str(r.id), name=r.name, type=r.type, value_kind=r.value_kind, value=engine.D(r.value), max_discount=engine.D(r.max_discount) if r.max_discount is not None else None,
                       priority=r.priority, combinable=r.combinable, exclusive=r.exclusive, max_combined_pct=engine.D(r.max_combined_pct) if r.max_combined_pct is not None else None,
                       starts_at=max([value for value in (aware(r.starts_at), aware(camp.starts_at) if camp else None) if value], default=None), ends_at=min([value for value in (aware(r.ends_at), aware(camp.ends_at) if camp else None) if value], default=None), config=config, campaign_id=str(camp.id) if camp else None, campaign_name=camp.name if camp else None)


async def _coupon_problem(db, c: Coupon, rule: DiscountRule | None, customer_id, now: datetime) -> str | None:
    if c.status != "Active" or rule is None or rule.status != "Active" or rule.tenant_id != c.tenant_id or rule.type != "coupon":
        return "That coupon is not active"
    if c.expires_at and now >= aware(c.expires_at):
        return "That coupon has expired"
    if c.max_redemptions is not None and c.redeemed_count >= c.max_redemptions:
        return "That coupon has been used the most times allowed"
    if c.customer_id and c.customer_id != customer_id:
        return "That coupon is for a specific customer. Choose that customer first"
    if c.per_customer_limit is not None:
        if customer_id is None:
            return "Choose the customer first: this coupon is limited per customer"
        used = await db.scalar(select(func.count()).select_from(CouponRedemption).where(
            CouponRedemption.tenant_id == c.tenant_id, CouponRedemption.coupon_id == c.id,
            CouponRedemption.customer_id == customer_id, CouponRedemption.released.is_(False)))
        if used >= c.per_customer_limit:
            return "This customer has already used that coupon the most times allowed"
    return None


async def prepare_pricing(db, user, data: PriceIn, branch, *, lock_coupons: bool = True) -> tuple[list[engine.Rule], engine.Context, dict, dict, dict]:
    """Price a cart. Returns the result, the rules on file by id, the valid coupons (locked) by code, and the business's discount settings."""
    tenant_id = user.tenant_id
    repo = DiscountRepository(db)
    config = await settings.load(db, tenant_id)
    eff = settings.effective(config)
    now = await _now(db, tenant_id)
    customer = None
    if data.customer_id:
        customer = await db.get(Customer, data.customer_id)
        if customer is None or customer.tenant_id != tenant_id:
            raise NotFoundError("Customer not found")

    rows = list(await repo.active_rules(tenant_id)) if eff["enabled"] else []
    camps = {c.id: c for c in await repo.campaigns(tenant_id, {r.campaign_id for r in rows if r.campaign_id})}
    rules: dict[str, DiscountRule] = {}
    engine_rules: list[engine.Rule] = []
    for r in rows:
        camp = camps.get(r.campaign_id) if r.campaign_id else None
        if r.campaign_id and (camp is None or not eff["campaigns"] or not _campaign_live(camp, now)):
            continue
        if camp is not None:
            if camp.branch_ids and str(branch) not in {str(id) for id in camp.branch_ids}:
                continue
            target = camp.target or {}
            if (target.get("customer_ids") or target.get("customer_types")) and not (customer and (
                str(customer.id) in {str(id) for id in target.get("customer_ids", [])} or customer.customer_type in target.get("customer_types", []))):
                continue
        rules[str(r.id)] = r
        engine_rules.append(_engine_rule(r, camp))

    problems: list[str] = []
    valid: dict[str, str] = {}
    held: dict[str, Coupon] = {}
    codes = list(dict.fromkeys(c.strip().upper() for c in data.coupon_codes if c.strip()))
    if codes and not eff["coupons"]:
        problems.append("Coupons are not switched on for this business")
        codes = []
    by_code = {c.code.upper(): c for c in await repo.coupons(tenant_id, codes, lock=lock_coupons)}
    for code in codes:
        c = by_code.get(code)
        if c is None:
            problems.append(f"Coupon {code}: that code is not valid")
            continue
        rule = await db.get(DiscountRule, c.rule_id)
        problem = await _coupon_problem(db, c, rule, customer.id if customer else None, now)
        if problem:
            problems.append(f"Coupon {code}: {problem}")
            continue
        if str(c.rule_id) not in rules:
            problems.append(f"Coupon {code}: this promotion is not available for this branch or customer")
            continue
        valid[str(c.rule_id)] = c.code
        held[c.code.upper()] = c

    legacy = {str(i): engine.D(item.discount) for i, item in enumerate(data.items) if engine.D(item.discount) > 0}
    manual = {"kind": data.manual_discount.kind, "value": engine.D(data.manual_discount.value), "reason": data.manual_discount.reason} if data.manual_discount else None
    if manual is None and legacy and data.manual_reason:
        manual = {"kind": "fixed", "value": 0, "reason": data.manual_reason}
    ctx = engine.Context(now=now, branch_id=str(branch) if branch else None, channel=data.channel, customer_id=str(customer.id) if customer else None,
                         customer_type=customer.customer_type if customer else None, valid_coupons=valid, usage=await repo.usage(tenant_id, customer.id if customer else None, {uuid.UUID(rule.id) for rule in engine_rules if any((rule.config.get("conditions") or {}).get(key) is not None for key in ("usage_limit", "per_customer_limit"))}),
                         automatic=eff["automatic"], manual=manual, manual_allowed=eff["manual_pos"] and (user.is_superuser or (user.role or "").lower() in ("owner", "admin") or "discounts:apply" in user.permissions_names), legacy_manual_lines=legacy,
                         authority_percent=await settings.authority_percent(db, user, config), advanced=eff["advanced"], coupons_enabled=eff["coupons"])
    boundaries = [value for rule in engine_rules for value in (rule.starts_at, rule.ends_at) if value and value > ctx.now]
    valid_until = min([ctx.now + timedelta(seconds=15), *boundaries]).isoformat()
    return engine_rules, ctx, rules, held, {**config, "_coupon_problems": problems, "_valid_until": valid_until}


def calculate_pricing(lines, rules, ctx):
    result = engine.price_cart(lines, rules, ctx)
    if ctx.channel == "pos" and any(
        line.cost is not None and engine.D(priced["net"]) < line.cost * line.qty
        for line, priced in zip(lines, result.lines, strict=True)
    ):
        result.blocked = "The selling price after discounts cannot be below unit cost"
    return result


async def quote(db, user, data: PriceIn, branch) -> tuple[engine.Result, dict, dict, dict]:
    engine_rules, ctx, rules, held, config = await prepare_pricing(db, user, data, branch)
    lines = await _lines(db, user.tenant_id, data)
    result = calculate_pricing(lines, engine_rules, ctx)
    applied_codes = {item.coupon_code.upper() for item in result.applied if item.coupon_code}
    for code in held:
        if code not in applied_codes:
            config["_coupon_problems"].append(f"Coupon {code}: this cart does not qualify or its discounts cannot combine")
    return result, rules, held, config


async def validate_checkout(db, user, data: PriceIn, branch, *, pricing: tuple | None = None) -> tuple[engine.Result, dict, dict, dict]:
    """What a sale is charged. Refuses a discount the person may not give, a bad coupon, and an approval that is not for exactly this sale."""
    result, rules, coupons, config = pricing if pricing is not None else await quote(db, user, data, branch)
    if result.blocked:
        raise ForbiddenError(result.blocked)
    if config.get("_coupon_problems"):
        raise ValidationError(config["_coupon_problems"][0])
    if not result.approval_required:
        return result, rules, coupons, config
    if not settings.effective(config).get("approvals"):
        raise ForbiddenError(f"{result.approval_reasons[0]}. Discount approvals are switched off, so reduce it.")
    if data.discount_approval_id is None:
        raise ApprovalRequiredError(f"{result.approval_reasons[0]}. Ask for approval, then complete the sale with the approval.")
    row = await DiscountRepository(db).get_for_tenant(ApprovalRequest, user.tenant_id, data.discount_approval_id)
    if row is None or row.kind != "discount":
        raise ForbiddenError("That approval was not found for this business")
    if row.status != "approved":
        raise ForbiddenError(f"That discount request is {row.status}. It has to be approved before the sale can be completed")
    if row.requested_by != user.id:
        raise ForbiddenError("That approval was given to someone else's request")
    if row.branch_id != branch:
        raise ForbiddenError("That approval was given for another branch")
    if row.applied_at is not None:
        raise ForbiddenError("That approval has already been used for a sale")
    payload = row.payload or {}
    if payload.get("context_hash") != result.context_hash:
        raise ForbiddenError("The sale changed after the discount was approved (items, quantities, customer, coupon or discount). It needs to be approved again")
    if payload.get("pricing") != result.dump():
        raise ForbiddenError("The priced cart is no longer what was approved. It needs to be approved again")
    return result, rules, coupons, {**config, "_approval_id": str(row.id)}


async def record_sale(db, user, order, pricing: tuple, created_items: list) -> None:
    """In the same transaction as the sale: freeze what was given (with the rule as it was), take coupon uses, and use up the approval."""
    result, rules, coupons, config = pricing
    for applied in result.applied:
        rule = rules.get(applied.rule_id) if applied.rule_id else None
        snapshot: dict = {"type": applied.type, "explanation": applied.explanation}
        if rule is not None:
            snapshot |= {"value": float(rule.value), "value_kind": rule.value_kind, "priority": rule.priority, "config": rule.config, "code": rule.code}
        approval_id = uuid.UUID(config["_approval_id"]) if applied.kind == "manual" and config.get("_approval_id") else None
        db.add(AppliedDiscount(tenant_id=order.tenant_id, order_id=order.id, rule_id=uuid.UUID(applied.rule_id) if applied.rule_id else None,
                               campaign_id=uuid.UUID(applied.campaign_id) if applied.campaign_id else None, rule_name=applied.name, rule_type=applied.type, kind=applied.kind,
                               coupon_code=applied.coupon_code, amount=applied.amount, lines={str(created_items[int(ref)].id): str(amount) for ref, amount in applied.lines.items()},
                               snapshot=snapshot, reason=(result_manual_reason(pricing) if applied.kind == "manual" else None), approval_id=approval_id, user_id=user.id,
                               branch_id=order.branch_id, customer_id=order.customer_id))
        if applied.kind == "coupon" and applied.coupon_code:
            coupon = coupons.get(applied.coupon_code.upper())
            # The row is locked since pricing: this check and the increment cannot interleave with another till.
            if coupon is None or (coupon.max_redemptions is not None and coupon.redeemed_count >= coupon.max_redemptions):
                raise ValidationError(f"Coupon {applied.coupon_code} has just been used up. Remove it and complete the sale again")
            coupon.redeemed_count += 1
            db.add(CouponRedemption(tenant_id=order.tenant_id, coupon_id=coupon.id, order_id=order.id, customer_id=order.customer_id, amount=applied.amount))
    if config.get("_approval_id"):
        row = await db.get(ApprovalRequest, uuid.UUID(config["_approval_id"]))
        if row is not None:
            row.applied_at = datetime.now(UTC)
            row.payload = {**(row.payload or {}), "used_order_id": str(order.id)}
    await db.flush()


def result_manual_reason(pricing: tuple) -> str | None:
    result = pricing[0]
    return next((a.explanation for a in result.applied if a.kind == "manual"), None)


async def release_coupon_usage(db, tenant_id: uuid.UUID, order_id: uuid.UUID) -> None:
    """A cancelled, rejected or voided sale gives its coupons back. The redemption stays as history, marked released."""
    rows = (await db.execute(select(CouponRedemption).where(CouponRedemption.tenant_id == tenant_id, CouponRedemption.order_id == order_id,
                                                            CouponRedemption.released.is_(False)).with_for_update())).scalars().all()
    for row in rows:
        coupon = await db.get(Coupon, row.coupon_id, with_for_update=True)
        row.released = True
        if coupon is not None:
            coupon.redeemed_count = max(coupon.redeemed_count - 1, 0)
    await db.flush()

