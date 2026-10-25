import asyncio
import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from pydantic import Field

from app.core.deps import CurrentUser, DbSession, SuperUser, get_current_active_superuser
from app.core.exceptions import ForbiddenError, ValidationError
from app.core.pagination import PageQuery
from app.core.rate_limit import rate_limit
from app.core.response import paginated_response, success_response
from app.modules.billing import enrollment, payments, provider, refunds, service
from app.modules.billing.pdf import invoice_pdf
from app.modules.billing.repository import BillingRepository
from app.modules.billing.schemas import (
    BillingSettingsInput,
    CallbackInput,
    ChangeRequest,
    ConfirmRequest,
    PayRequest,
    PlanInput,
    RefundCallback,
    RefundRequest,
    Strict,
    SubscriptionAction,
)

admin_router = APIRouter(
    prefix="/admin/billing",
    tags=["Platform billing"],
    dependencies=[Depends(get_current_active_superuser)],
)
tenant_router = APIRouter(prefix="/tenants/billing", tags=["Company billing"])
callback_router = APIRouter(prefix="/billing", tags=["Billing callbacks"])
Key = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=100)]
Kind = Literal["plans", "subscriptions", "invoices", "payments", "refunds"]


def _require_tenant(id: uuid.UUID | None) -> uuid.UUID:
    if id is None:
        raise ForbiddenError("A company account is required")
    return id


@admin_router.get("/overview")
async def admin_overview(
    db: DbSession,
    actor: SuperUser,
    currency: str = "",
    plan_id: str = "",
    status: str = "",
    from_date: date | None = None,
    to_date: date | None = None,
) -> Response:
    return success_response(
        await service.billing_report(db, actor, currency, plan_id, status, from_date, to_date)
    )


@admin_router.get("/settings")
async def settings_read(db: DbSession, actor: SuperUser) -> Response:
    return success_response(await service.get_settings(db, actor))


@admin_router.put("/settings")
async def settings_update(data: BillingSettingsInput, db: DbSession, actor: SuperUser) -> Response:
    return success_response(await service.save_settings(db, actor, data))


@admin_router.post("/plans")
async def plan_create(data: PlanInput, db: DbSession, actor: SuperUser, key: Key) -> Response:
    return success_response(await service.save_plan(db, actor, data, None, key), status_code=201)


@admin_router.put("/plans/{id}")
async def plan_update(
    id: uuid.UUID, data: PlanInput, db: DbSession, actor: SuperUser, key: Key
) -> Response:
    return success_response(await service.save_plan(db, actor, data, id, key))


class EnrollRequest(Strict):
    mode: Literal["trial", "complimentary"]
    trial_days: int = Field(default=30, ge=1, le=365)
    plan_id: uuid.UUID | None = None  # omit to give each business the cheapest plan that fits it
    notify: bool = False
    keep_modules: bool = True  # False: choose by users/branches only; a business may lose modules its plan doesn't include
    dry_run: bool = True
    confirm_count: int | None = Field(default=None, ge=0)
    tenant_ids: list[uuid.UUID] | None = Field(default=None, max_length=500)  # optional pilot: only these businesses


@admin_router.post("/enroll-existing", dependencies=[Depends(rate_limit("billing_enroll", 10, 60))])
async def enroll_existing(data: EnrollRequest, db: DbSession, actor: SuperUser) -> Response:
    """Move businesses with no subscription onto a plan without charging them (free trial or complimentary). Dry run by
    default; a real run needs the exact count from the preview."""
    result = await enrollment.enroll_existing(db, actor, mode=data.mode, trial_days=data.trial_days, plan_id=data.plan_id, notify=data.notify,
                                              dry_run=data.dry_run, confirm_count=data.confirm_count, tenant_ids=data.tenant_ids, keep_modules=data.keep_modules)
    if not data.dry_run:
        await db.commit()
    return success_response(result)


@admin_router.get("/plans/{id}/prices")
async def price_history(
    id: uuid.UUID, db: DbSession, actor: SuperUser, page: PageQuery
) -> Response:
    service.authorize(actor, "read", platform=True)
    rows, total = await BillingRepository(db).price_history(id, page.offset, min(page.limit, 100))
    return paginated_response(rows, total, page.page, min(page.limit, 100))


@tenant_router.get("/overview")
async def tenant_overview(db: DbSession, actor: CurrentUser) -> Response:
    return success_response(await service.overview(db, actor, _require_tenant(actor.tenant_id)))


@admin_router.get("/tenants/{tenant_id}")
async def company_overview(tenant_id: uuid.UUID, db: DbSession, actor: SuperUser) -> Response:
    return success_response(await service.overview(db, actor, tenant_id))


@tenant_router.post("/preview")
async def tenant_preview(data: ChangeRequest, db: DbSession, actor: CurrentUser) -> Response:
    return success_response(
        await service.preview_change(db, actor, _require_tenant(actor.tenant_id), data)
    )


@admin_router.post("/tenants/{tenant_id}/preview")
async def admin_preview(
    tenant_id: uuid.UUID, data: ChangeRequest, db: DbSession, actor: SuperUser
) -> Response:
    return success_response(await service.preview_change(db, actor, tenant_id, data))


@tenant_router.post("/confirm")
async def tenant_confirm(
    data: ConfirmRequest, db: DbSession, actor: CurrentUser, key: Key
) -> Response:
    return success_response(
        await service.confirm_change(
            db, actor, _require_tenant(actor.tenant_id), data.quote_id, key
        )
    )


@admin_router.post("/tenants/{tenant_id}/confirm")
async def admin_confirm(
    tenant_id: uuid.UUID, data: ConfirmRequest, db: DbSession, actor: SuperUser, key: Key
) -> Response:
    return success_response(await service.confirm_change(db, actor, tenant_id, data.quote_id, key))


@tenant_router.post("/subscription")
async def tenant_action(
    data: SubscriptionAction, db: DbSession, actor: CurrentUser, key: Key
) -> Response:
    return success_response(
        await service.subscription_action(db, actor, _require_tenant(actor.tenant_id), data, key)
    )


@admin_router.post("/tenants/{tenant_id}/subscription")
async def admin_action(
    tenant_id: uuid.UUID, data: SubscriptionAction, db: DbSession, actor: SuperUser, key: Key
) -> Response:
    return success_response(await service.subscription_action(db, actor, tenant_id, data, key))


@tenant_router.get("/payment-methods")
@admin_router.get("/payment-methods")
async def payment_methods(db: DbSession, actor: CurrentUser) -> Response:
    service.authorize(actor, "read")
    return success_response(await provider.methods())


@tenant_router.post("/invoices/{id}/pay", dependencies=[Depends(rate_limit("billing_pay", 10, 60))])
async def pay(
    id: uuid.UUID, data: PayRequest, db: DbSession, actor: CurrentUser, key: Key
) -> Response:
    return success_response(
        await payments.initiate_payment(db, actor, _require_tenant(actor.tenant_id), id, data, key)
    )


@tenant_router.post("/payments/{reference}/refresh")
@admin_router.post("/payments/{reference}/refresh")
async def refresh_payment(reference: uuid.UUID, db: DbSession, actor: CurrentUser) -> Response:
    return success_response(await payments.reconcile(db, reference, actor))


@callback_router.post(
    "/pawapay/callback", dependencies=[Depends(rate_limit("billing_callback", 600, 60))]
)
async def callback(request: Request, db: DbSession) -> Response:
    # Body limit; callbacks convey only a UUID. Verification uses authenticated provider GET.
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 16384:
            raise ValidationError("Callback is too large")
    try:
        data = CallbackInput.model_validate_json(body)
    except ValueError as exc:
        raise ValidationError("Invalid callback") from exc
    await payments.reconcile(db, data.depositId)
    return success_response({"received": True})


async def document(
    db: DbSession,
    actor: CurrentUser,
    id: uuid.UUID,
    platform: bool,
    receipt_reference: uuid.UUID | None = None,
) -> Response:
    invoice = await service.detail(db, actor, "invoices", id, platform)
    receipt = None
    if receipt_reference:
        payment = await BillingRepository(db).payment_reference(
            receipt_reference, invoice["tenant_id"]
        )
        if (
            not payment
            or payment.invoice_id != id
            or payment.tenant_id != invoice["tenant_id"]
            or payment.status != "succeeded"
        ):
            raise ValidationError("A verified payment is required for a receipt")
        receipt = {"reference": payment.reference, "amount": payment.amount}
    pdf = await asyncio.to_thread(invoice_pdf, invoice, invoice["currency_decimals"], receipt)
    return Response(
        pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{invoice["number"]}{"-receipt" if receipt else ""}.pdf"',
            "Cache-Control": "private, no-store",
        },
    )


@tenant_router.get("/invoices/{id}/pdf")
async def tenant_pdf(
    id: uuid.UUID, db: DbSession, actor: CurrentUser, receipt: uuid.UUID | None = None
) -> Response:
    _require_tenant(actor.tenant_id)
    return await document(db, actor, id, False, receipt)


@admin_router.get("/invoices/{id}/pdf")
async def admin_pdf(
    id: uuid.UUID, db: DbSession, actor: SuperUser, receipt: uuid.UUID | None = None
) -> Response:
    return await document(db, actor, id, True, receipt)


@admin_router.get("/subscriptions/{id}/history")
async def admin_history(
    id: uuid.UUID, db: DbSession, actor: SuperUser, page: PageQuery
) -> Response:
    from app.modules.billing.repository import subscription_history

    sub = await service.detail(db, actor, "subscriptions", id, True)
    rows, total = await subscription_history(db, sub["tenant_id"], id, page.offset, page.limit)
    return paginated_response(rows, total, page.page, min(page.limit, 100))


@admin_router.post("/payments/{reference}/refund")
async def admin_refund(
    reference: uuid.UUID, data: RefundRequest, db: DbSession, actor: SuperUser, key: Key
) -> Response:
    return success_response(await refunds.initiate(db, actor, reference, data, key))


@admin_router.post("/refunds/{reference}/refresh")
async def refresh_refund(reference: uuid.UUID, db: DbSession, actor: SuperUser) -> Response:
    return success_response(await refunds.reconcile(db, reference))


@callback_router.post(
    "/pawapay/refund-callback",
    dependencies=[Depends(rate_limit("billing_refund_callback", 600, 60))],
)
async def refund_callback(request: Request, db: DbSession) -> Response:
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 16384:
            raise ValidationError("Callback is too large")
    try:
        data = RefundCallback.model_validate_json(body)
    except ValueError as exc:
        raise ValidationError("Invalid callback") from exc
    await refunds.reconcile(db, data.refundId)
    return success_response({"received": True})


@tenant_router.get("/refunds/{id}/pdf")
@admin_router.get("/refunds/{id}/pdf")
async def credit_note(id: uuid.UUID, db: DbSession, actor: CurrentUser) -> Response:
    record = await service.detail(db, actor, "refunds", id)
    if record["status"] != "succeeded":
        raise ValidationError("A credit note requires a verified refund")
    doc = record["document"]
    invoice = {
        "number": record["number"],
        "tenant_name": doc["bill_to"],
        "created_at": record["created_at"],
        "due_at": record["created_at"],
        "period_start": datetime.fromisoformat(doc["period_start"]),
        "period_end": datetime.fromisoformat(doc["period_end"]),
        "status": "refunded",
        "currency": record["currency"],
        "total": record["amount"],
        "paid": record["amount"],
        "subtotal": record["amount"] - doc["tax"],
        "tax": doc["tax"],
        "document_title": "REFUND CREDIT NOTE",
        "lines": [
            {
                "description": f"Refund for {doc['invoice_number']}: {record['reason']}",
                "amount": record["amount"],
            }
        ],
    }
    pdf = await asyncio.to_thread(invoice_pdf, invoice, doc["currency_decimals"])
    return Response(
        pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{record["number"]}.pdf"',
            "Cache-Control": "private, no-store",
        },
    )


def add_list_routes(router: APIRouter, platform: bool) -> None:
    @router.get("/{kind}")
    async def records(
        kind: Kind,
        db: DbSession,
        actor: CurrentUser,
        page: PageQuery,
        q: str = Query("", max_length=100),
        status: str = "",
        currency: str = "",
        plan_id: uuid.UUID | None = None,
        invoice_id: uuid.UUID | None = None,
        tenant_id: uuid.UUID | None = None,
        payment_id: uuid.UUID | None = None,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
    ) -> Response:
        if not platform:
            _require_tenant(actor.tenant_id)
        if page.page_size > 100:
            raise ValidationError("Billing pages are capped at 100 records")
        for d in (from_date, to_date):
            if d is not None and d.tzinfo is None:
                raise ValidationError("Date filters must include a timezone")
        rows, total = await service.list_records(
            db,
            actor,
            kind,
            page.page,
            page.page_size,
            {
                "q": q,
                "status": status,
                "currency": currency,
                "plan_id": plan_id,
                "from_date": from_date,
                "to_date": to_date,
                "invoice_id": invoice_id,
                "tenant_id": tenant_id,
                "payment_id": payment_id,
            },
            platform,
        )
        return paginated_response(rows, total, page.page, page.page_size)

    @router.get("/{kind}/{id}")
    async def get_record(
        kind: Literal["plans", "subscriptions", "invoices", "refunds"],
        id: uuid.UUID,
        db: DbSession,
        actor: CurrentUser,
    ) -> Response:
        if not platform:
            _require_tenant(actor.tenant_id)
        return success_response(await service.detail(db, actor, kind, id, platform))


add_list_routes(admin_router, True)
add_list_routes(tenant_router, False)
