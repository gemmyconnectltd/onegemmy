import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.encoders import jsonable_encoder

from app.core.deps import ActiveBranchId, CurrentUser, DbSession, require_permission
from app.core.exceptions import ForbiddenError, ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.discounts import management, settings
from app.modules.discounts.models import Coupon, DiscountRule, PromotionCampaign
from app.modules.discounts.repository import DiscountRepository
from app.modules.discounts.schemas import (
    ApprovalRequestIn,
    CampaignIn,
    CatalogPriceIn,
    CouponGenerate,
    PriceIn,
    RuleIn,
    SettingsIn,
    StatusIn,
)
from app.modules.discounts.service import quote, require_enabled

router = APIRouter(prefix="/sales/discounts", tags=["Discounts & Promotions"])


def _require_tenant(user):
    if not user.tenant_id:
        raise ValidationError("This account has no tenant")


def output(row):
    return jsonable_encoder({c.name: getattr(row, c.name) for c in row.__table__.columns})


@router.get("/settings")
async def get_settings(db: DbSession, user: CurrentUser):
    _require_tenant(user)
    config = await settings.load(db, user.tenant_id)
    return success_response(data={**config, "effective": settings.effective(config)})


@router.patch("/settings", dependencies=[Depends(require_permission("discounts:settings"))])
async def update_settings(data: SettingsIn, db: DbSession, user: CurrentUser):
    _require_tenant(user)
    await DiscountRepository(db).lock(user.tenant_id)
    result = await settings.save(db, user.tenant_id, data.model_dump(exclude_none=True))
    from app.modules.audit.service import record_audit

    await record_audit(
        db,
        tenant_id=user.tenant_id,
        actor_user_id=user.id,
        actor_name=None,
        action="discount.settings",
        entity_type="tenant",
        entity_id=str(user.tenant_id),
        summary="Discount settings changed",
        changes=data.model_dump(exclude_none=True),
    )
    await db.commit()
    return success_response(data=result)


async def preview_access(user: CurrentUser):
    if user.is_superuser or (user.role or "").lower() in ("owner", "admin"):
        return
    assigned = set(getattr(user, "role_permissions_names", []))
    if not assigned & {"pos:read", "orders:read", "discounts:read"}:
        raise ForbiddenError("Pricing previews require assigned sales or discount access")


@router.post("/catalog/preview", dependencies=[Depends(preview_access)])
async def catalog_preview(data: CatalogPriceIn, db: DbSession, user: CurrentUser, branch: ActiveBranchId):
    _require_tenant(user)
    from app.modules.discounts.catalog import catalog_prices
    from app.modules.sales.service.order import _resolve_order_branch_id
    branch = await _resolve_order_branch_id(db, user.tenant_id, branch, data.cart.branch_id if data.cart else None)
    return success_response(data=await catalog_prices(db, user, data, branch))


@router.post("/preview", dependencies=[Depends(preview_access)])
async def preview(data: PriceIn, db: DbSession, user: CurrentUser, branch: ActiveBranchId):
    _require_tenant(user)
    from app.modules.sales.service.order import _price_vat, _resolve_order_branch_id

    branch = await _resolve_order_branch_id(db, user.tenant_id, branch, data.branch_id)
    result, rules, coupons, config = await quote(db, user, data, branch)
    approval_status = "pending" if result.approval_required else "not_required"
    if result.approval_required and data.discount_approval_id:
        from app.modules.discounts.service import validate_checkout
        await validate_checkout(db, user, data, branch, pricing=(result, rules, coupons, config))
        approval_status = "approved"
    from types import SimpleNamespace

    # VAT per line on what each line sells for after every discount, through the same engine the checkout uses.
    lines = [SimpleNamespace(product_id=item.product_id, variant_id=item.variant_id, line_total=priced["net"])
             for item, priced in zip(data.items, result.lines, strict=True)]
    tax, total, _, vat = await _price_vat(db, user.tenant_id, lines, 0)

    from app.modules.discounts.service import pricing_hash
    product_total = sum((item.amount for item in result.applied if item.kind == "automatic" and item.type != "order"), 0)
    order_total = sum((item.amount for item in result.applied if item.kind == "manual" or item.type == "order"), 0)
    return success_response(
        data={
            **result.dump(),
            "product_discount_total": str(product_total),
            "order_discount_total": str(order_total),
            "coupon_discount_total": str(result.coupon_total),
            "coupon_errors": config.get("_coupon_problems", []),
            "approval_status": approval_status,
            "valid_until": config["_valid_until"],
            "tax": str(tax),
            "total": str(total),
            "vat": vat.dump(),
            "pricing_hash": pricing_hash(result),
        }
    )


@router.post("/approvals", dependencies=[Depends(require_permission("discounts:apply"))])
async def request_approval(
    data: ApprovalRequestIn, db: DbSession, user: CurrentUser, branch: ActiveBranchId
):
    _require_tenant(user)
    await require_enabled(db, user, "approvals")
    from app.modules.approvals.service import create_request
    from app.modules.sales.service.order import _resolve_order_branch_id

    branch = await _resolve_order_branch_id(db, user.tenant_id, branch, data.branch_id)
    result, _, _, _ = await quote(db, user, data, branch)
    if result.blocked or not result.approval_required:
        raise ValidationError(result.blocked or "This cart does not require discount approval")
    row = await create_request(
        db,
        user,
        kind="discount",
        subject_id=None,
        branch_id=branch,
        reason=data.reason,
        payload={
            "context_hash": result.context_hash,
            "pricing": result.dump(),
            "subtotal": str(result.subtotal),
            "discount": str(result.total_discount),
            "discount_percent": str(result.manual_percent),
        },
    )
    return success_response(data=output(row), status_code=201)


@router.get("/rules", dependencies=[Depends(require_permission("discounts:read"))])
async def rules(
    db: DbSession,
    user: CurrentUser,
    page: PageQuery,
    search: str | None = Query(None, max_length=100),
):
    _require_tenant(user)
    rows, total = await DiscountRepository(db).page(
        DiscountRule, user.tenant_id, page.offset, page.limit, search
    )
    return paginated_response(
        items=[output(r) for r in rows], total=total, page=page.page, page_size=page.page_size
    )


@router.post("/rules", dependencies=[Depends(require_permission("discounts:create"))])
async def create_rule(data: RuleIn, db: DbSession, user: CurrentUser):
    _require_tenant(user)
    if data.activate:
        raise ValidationError("Save the rule, then activate it with activation permission")
    return success_response(
        data=output(await management.upsert(db, user, DiscountRule, data)), status_code=201
    )


@router.put("/rules/{id}", dependencies=[Depends(require_permission("discounts:update"))])
async def update_rule(id: uuid.UUID, data: RuleIn, db: DbSession, user: CurrentUser):
    _require_tenant(user)
    return success_response(data=output(await management.upsert(db, user, DiscountRule, data, id)))


@router.post("/rules/{id}/status", dependencies=[Depends(require_permission("discounts:activate"))])
async def rule_status(id: uuid.UUID, data: StatusIn, db: DbSession, user: CurrentUser):
    _require_tenant(user)
    return success_response(
        data=output(await management.change_status(db, user, DiscountRule, id, data.status))
    )


@router.get("/campaigns", dependencies=[Depends(require_permission("discounts:read"))])
async def campaigns(db: DbSession, user: CurrentUser, page: PageQuery):
    _require_tenant(user)
    rows, total = await DiscountRepository(db).page(
        PromotionCampaign, user.tenant_id, page.offset, page.limit
    )
    return paginated_response(
        items=[output(r) for r in rows], total=total, page=page.page, page_size=page.page_size
    )


@router.post("/campaigns", dependencies=[Depends(require_permission("discounts:promotions"))])
async def create_campaign(data: CampaignIn, db: DbSession, user: CurrentUser):
    _require_tenant(user)
    return success_response(
        data=output(await management.upsert(db, user, PromotionCampaign, data)), status_code=201
    )


@router.put("/campaigns/{id}", dependencies=[Depends(require_permission("discounts:promotions"))])
async def update_campaign(id: uuid.UUID, data: CampaignIn, db: DbSession, user: CurrentUser):
    _require_tenant(user)
    return success_response(
        data=output(await management.upsert(db, user, PromotionCampaign, data, id))
    )


@router.post(
    "/campaigns/{id}/status", dependencies=[Depends(require_permission("discounts:promotions"))]
)
async def campaign_status(id: uuid.UUID, data: StatusIn, db: DbSession, user: CurrentUser):
    _require_tenant(user)
    return success_response(
        data=output(await management.change_status(db, user, PromotionCampaign, id, data.status))
    )


@router.get("/coupons", dependencies=[Depends(require_permission("discounts:read"))])
async def coupons(db: DbSession, user: CurrentUser, page: PageQuery):
    _require_tenant(user)
    rows, total = await DiscountRepository(db).page(Coupon, user.tenant_id, page.offset, page.limit)
    return paginated_response(
        items=[output(r) for r in rows], total=total, page=page.page, page_size=page.page_size
    )


@router.post("/coupons", dependencies=[Depends(require_permission("discounts:coupons"))])
async def generate_coupons(data: CouponGenerate, db: DbSession, user: CurrentUser):
    _require_tenant(user)
    await require_enabled(db, user, "coupons")
    repo = DiscountRepository(db)
    await repo.lock(user.tenant_id)
    rule = await repo.get_for_tenant(DiscountRule, user.tenant_id, data.rule_id)
    if not rule or rule.type != "coupon":
        raise ValidationError("Choose a coupon discount rule belonging to this business")
    if data.code and data.count != 1:
        raise ValidationError("A custom code generates one coupon")
    if data.customer_id:
        from app.modules.sales.models.customer import Customer

        if not await repo.get_for_tenant(Customer, user.tenant_id, data.customer_id):
            raise ValidationError("Coupon customer must belong to this business")
    rows = []
    for _ in range(data.count):
        row = Coupon(
            tenant_id=user.tenant_id,
            created_by=user.id,
            **data.model_dump(exclude={"code", "count", "prefix"}),
            code=(data.code or f"{data.prefix or ''}{uuid.uuid4().hex[:16]}").strip().upper(),
        )
        await repo.save(row)
        rows.append(row)
    await db.commit()
    return success_response(data=[output(r) for r in rows], status_code=201)


@router.post(
    "/coupons/{id}/status", dependencies=[Depends(require_permission("discounts:coupons"))]
)
async def coupon_status(id: uuid.UUID, data: StatusIn, db: DbSession, user: CurrentUser):
    _require_tenant(user)
    return success_response(
        data=output(await management.change_status(db, user, Coupon, id, data.status))
    )


@router.get("/analytics", dependencies=[Depends(require_permission("discounts:analytics"))])
async def analytics(
    db: DbSession,
    user: CurrentUser,
    branch: ActiveBranchId,
    start: datetime | None = None,
    end: datetime | None = None,
):
    _require_tenant(user)
    from app.modules.discounts.reporting import analytics as report

    return success_response(data=await report(db, user.tenant_id, branch, start, end))


@router.get("/overview", dependencies=[Depends(require_permission("discounts:analytics"))])
async def overview(db: DbSession, user: CurrentUser, branch: ActiveBranchId):
    _require_tenant(user)
    from app.modules.discounts.reporting import overview as report

    return success_response(data=await report(db, user.tenant_id, branch))
