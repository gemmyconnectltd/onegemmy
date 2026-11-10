"""Rule and campaign lifecycle. Historical applied records are never edited."""

import uuid
from datetime import UTC, datetime, time
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi.encoders import jsonable_encoder

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.audit.service import record_audit
from app.modules.discounts.models import Coupon, DiscountRule, PromotionCampaign
from app.modules.discounts.repository import DiscountRepository
from app.modules.discounts.service import require_enabled


def validate(data):
    if (
        data.starts_at
        and data.starts_at.tzinfo is None
        or data.ends_at
        and data.ends_at.tzinfo is None
    ):
        raise ValidationError("Schedules require a timezone offset")
    if data.starts_at and data.ends_at and data.starts_at >= data.ends_at:
        raise ValidationError("End must be after start")
    if not (data is None) and hasattr(data, "value_kind"):
        if data.type in ("volume", "tiered") and data.value_kind != "percent":
            raise ValidationError("Quantity tiers use percentage rewards")
        if data.value_kind == "percent" and data.value > 100:
            raise ValidationError("Percentage cannot exceed 100")
        config = data.config
        scope = config.get("scope") or {}
        if data.type == "product" and not (scope.get("product_ids") or scope.get("variant_ids")):
            raise ValidationError("Select at least one product or variant")
        if data.type == "category" and not scope.get("category_ids"):
            raise ValidationError("Select at least one category")
        if data.type == "customer" and not (
            scope.get("customer_ids") or scope.get("customer_types")
        ):
            raise ValidationError("Select customers or an existing customer classification")
        if data.type == "fixed" and data.value_kind != "fixed":
            raise ValidationError("Fixed discount rules must use a fixed amount reward")
        if data.type == "percentage" and data.value_kind != "percent":
            raise ValidationError("Percentage rules must use a percentage reward")
        try:
            for key, value in (config.get("conditions") or {}).items():
                if key not in (
                    "min_order_amount",
                    "min_quantity",
                    "usage_limit",
                    "per_customer_limit",
                    "min_margin_percent",
                ):
                    raise ValueError("Unknown condition")
                number = Decimal(str(value))
                if (
                    not number.is_finite()
                    or number < 0
                    or key == "min_margin_percent"
                    and number >= 100
                ):
                    raise ValueError("Invalid condition")
            for group in ("buy", "get"):
                qty = Decimal(str((config.get(group) or {}).get("qty", 1)))
                if qty <= 0 or qty != int(qty):
                    raise ValueError("BOGO quantities must be positive integers")
            reward = Decimal(str((config.get("get") or {}).get("percent", 100)))
            if not 0 <= reward <= 100:
                raise ValueError("Invalid BOGO reward")
            bands = config.get("tiers") or config.get("thresholds") or []
            if data.type in ("tiered", "volume") and not bands:
                raise ValueError("Quantity tiers are required")
            seen = set()
            for band in bands:
                threshold = Decimal(str(band.get("from", band.get("min_qty", 0))))
                rate = Decimal(str(band["value"]))
                if (
                    not threshold.is_finite()
                    or threshold < 0
                    or threshold in seen
                    or not 0 <= rate <= 100
                ):
                    raise ValueError("Invalid or duplicate tier")
                seen.add(threshold)
            if config.get("mode", "highest") not in ("highest", "progressive"):
                raise ValueError("Unknown tier mode")
            if config.get("basis", "quantity") not in ("quantity", "amount"):
                raise ValueError("Unknown tier basis")
            if config.get("mode") == "progressive" and config.get("basis") == "amount":
                raise ValueError("Progressive tiers support quantity only")
            window = config.get("time_window") or {}
            if window:
                time.fromisoformat(window["start"])
                time.fromisoformat(window["end"])
            if config.get("timezone"):
                ZoneInfo(config["timezone"])
        except (ValueError, TypeError, KeyError, InvalidOperation, ZoneInfoNotFoundError) as exc:
            raise ValidationError(f"Invalid discount configuration: {exc}") from exc


async def upsert(db, user, model, data, id=None):
    await require_enabled(db, user, "campaigns" if model == PromotionCampaign else "enabled")
    validate(data)
    if model == DiscountRule:
        from app.modules.discounts.engine import ADVANCED

        if data.type in ADVANCED:
            await require_enabled(db, user, "advanced")
        if data.type == "coupon":
            await require_enabled(db, user, "coupons")
        if data.campaign_id:
            await require_enabled(db, user, "campaigns")
    repo = DiscountRepository(db)
    await repo.lock(user.tenant_id)
    row = (
        await repo.get_for_tenant(model, user.tenant_id, id)
        if id
        else model(tenant_id=user.tenant_id, created_by=user.id)
    )
    if row is None:
        raise NotFoundError("Discount configuration not found")
    values = data.model_dump(exclude={"activate", "rule_ids"})
    values["code"] = (
        (values.get("code") or (row.code if id else uuid.uuid4().hex[:12])).strip().upper()
    )
    if (
        model == DiscountRule
        and data.campaign_id
        and not await repo.get_for_tenant(PromotionCampaign, user.tenant_id, data.campaign_id)
    ):
        raise NotFoundError("Promotion campaign not found")
    if model == DiscountRule:
        # Validate every configured target against the owning business.
        from sqlalchemy import select

        from app.modules.inventory.models.category import Category
        from app.modules.inventory.models.product import Product
        from app.modules.inventory.models.variant import ProductVariant
        from app.modules.sales.models.customer import Customer
        from app.modules.tenants.models import Branch

        scope = values.get("config", {}).get("scope") or {}
        targets = [
            (scope, "product_ids", Product),
            (scope, "exclude_product_ids", Product),
            (scope, "category_ids", Category),
            (scope, "exclude_category_ids", Category),
            (scope, "customer_ids", Customer),
            (scope, "branch_ids", Branch),
        ]
        for pool in (
            values.get("config", {}).get("buy") or {},
            values.get("config", {}).get("get") or {},
        ):
            targets.extend([(pool, "product_ids", Product), (pool, "category_ids", Category)])
        for source, key, target in targets:
            ids = {uuid.UUID(raw) for raw in source.get(key) or []}
            if ids:
                found = set(
                    (
                        await db.scalars(
                            select(target.id).where(
                                target.tenant_id == user.tenant_id, target.id.in_(ids)
                            )
                        )
                    ).all()
                )
                if found != ids:
                    raise ValidationError(f"Invalid {key} target")
        variant_ids = {uuid.UUID(raw) for raw in scope.get("variant_ids") or []}
        if variant_ids:
            found = set(
                (
                    await db.scalars(
                        select(ProductVariant.id)
                        .join(Product)
                        .where(
                            Product.tenant_id == user.tenant_id, ProductVariant.id.in_(variant_ids)
                        )
                    )
                ).all()
            )
            if found != variant_ids:
                raise ValidationError("Invalid variant target")
    if model == PromotionCampaign:
        from sqlalchemy import select

        from app.modules.sales.models.customer import Customer
        from app.modules.tenants.models import Branch

        ids = set(data.branch_ids)
        if (
            ids
            and set(
                (
                    await db.scalars(
                        select(Branch.id).where(
                            Branch.tenant_id == user.tenant_id, Branch.id.in_(ids)
                        )
                    )
                ).all()
            )
            != ids
        ):
            raise ValidationError("Campaign branches must belong to this business")
        target_ids = set()
        try:
            target_ids = {
                uuid.UUID(str(raw)) for raw in (data.target or {}).get("customer_ids", [])
            }
        except (ValueError, TypeError) as exc:
            raise ValidationError("Invalid campaign customer references") from exc
        if (
            target_ids
            and set(
                (
                    await db.scalars(
                        select(Customer.id).where(
                            Customer.tenant_id == user.tenant_id, Customer.id.in_(target_ids)
                        )
                    )
                ).all()
            )
            != target_ids
        ):
            raise ValidationError("Campaign customers must belong to this business")
        if any(
            value not in ("individual", "business")
            for value in (data.target or {}).get("customer_types", [])
        ):
            raise ValidationError("Choose an existing customer classification")
    for key, value in values.items():
        setattr(
            row,
            key,
            jsonable_encoder(value) if key in ("config", "branch_ids", "target") else value,
        )
    await repo.save(row)
    if model == PromotionCampaign and data.rule_ids is not None:
        for rule_id in data.rule_ids:
            rule = await repo.get_for_tenant(DiscountRule, user.tenant_id, rule_id)
            if not rule:
                raise NotFoundError("Discount rule not found")
            rule.campaign_id = row.id
    await record_audit(
        db,
        tenant_id=user.tenant_id,
        actor_user_id=user.id,
        actor_name=None,
        action="discount.updated" if id else "discount.created",
        entity_type=model.__tablename__,
        entity_id=str(row.id),
        summary=f"Saved {row.name}",
    )
    await db.commit()
    return row


async def change_status(db, user, model, id, status):
    await require_enabled(
        db,
        user,
        "campaigns" if model == PromotionCampaign else "coupons" if model == Coupon else "enabled",
    )
    repo = DiscountRepository(db)
    await repo.lock(user.tenant_id)
    row = await repo.get_for_tenant(model, user.tenant_id, id)
    if not row:
        raise NotFoundError("Discount configuration not found")
    statuses = (
        ("Active", "Disabled")
        if model == Coupon
        else ("Draft", "Active", "Paused", "Cancelled", "Archived")
    )
    if model == PromotionCampaign:
        statuses += ("Scheduled", "Expired")
    if status not in statuses:
        raise ValidationError("Invalid status for this resource")
    row.status = status
    if model == DiscountRule and status == "Active":
        row.activated_at = datetime.now(UTC)
    await record_audit(
        db,
        tenant_id=user.tenant_id,
        actor_user_id=user.id,
        actor_name=None,
        action="discount.status",
        entity_type=model.__tablename__,
        entity_id=str(id),
        summary=f"Status changed to {status}",
    )
    await db.commit()
    return row
