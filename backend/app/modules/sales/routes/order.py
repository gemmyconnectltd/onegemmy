import uuid
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, EmailStr, Field

from app.core.deps import ActiveBranchId, CurrentUser, DbSession, require_permission
from app.core.exceptions import ForbiddenError, ValidationError
from app.core.pagination import PageQuery
from app.core.period import PeriodQuery
from app.core.response import paginated_response, success_response
from app.modules.sales import service
from app.modules.sales.routes.access import order_access
from app.modules.sales.schemas import OrderBulkCreate, OrderCorrection, OrderCreate, OrderUpdate
from app.modules.sales.schemas.order import OrderDecision

router = APIRouter(tags=["Sales - Orders"], dependencies=[Depends(order_access)])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/sales/vat-rate")
async def vat_rate(db: DbSession, current_user: CurrentUser):
    """The VAT the business really charges, so the till shows what the server will record (never a hard-coded rate)."""
    _require_tenant(current_user.tenant_id)
    from app.modules.accounting.service.tax import get_effective_vat_rate, is_vat_enabled
    enabled = await is_vat_enabled(db, current_user.tenant_id)
    return success_response(data={"enabled": enabled, "rate": float(await get_effective_vat_rate(db, current_user.tenant_id)) if enabled else 0.0}, message="VAT rate retrieved")


@router.get("/sales/orders")
async def list_orders(
    db: DbSession, current_user: CurrentUser, page_params: PageQuery, active_branch_id: ActiveBranchId, period: PeriodQuery,
    status: str | None = Query(None), search: str | None = Query(None),
    payment_status: str | None = Query(None), archived: bool = Query(False),
):
    _require_tenant(current_user.tenant_id)
    items = await service.list_orders(db, current_user.tenant_id, status, page_params.offset, page_params.limit, search, payment_status, active_branch_id, period, archived)
    total = await service.count_orders(db, current_user.tenant_id, status, search, payment_status, active_branch_id, period, archived)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Orders retrieved successfully")


@router.post("/sales/orders")
async def create_order(data: OrderCreate, db: DbSession, current_user: CurrentUser, active_branch_id: ActiveBranchId):
    _require_tenant(current_user.tenant_id)
    can_approve = current_user.is_superuser or "credit:approve" in current_user.permissions_names
    if data.ordered_at is not None:
        await service.require_backdating_allowed(db, current_user, data.ordered_at)
    can_sell_credit = current_user.is_superuser or "credit:create" in current_user.permissions_names
    obj = await service.create_order(db, current_user.tenant_id, current_user.id, data, active_branch_id, can_approve_credit=can_approve, can_sell_credit=can_sell_credit)
    return success_response(data=obj.model_dump(), message="Order created successfully", status_code=201)


@router.post("/sales/orders/bulk")
async def bulk_create_orders(data: OrderBulkCreate, db: DbSession, current_user: CurrentUser, active_branch_id: ActiveBranchId):
    _require_tenant(current_user.tenant_id)
    result = await service.bulk_create_orders(db, current_user.tenant_id, current_user.id, data, active_branch_id)
    return success_response(data=result.model_dump(), message=f"{result.created} orders imported", status_code=201)


@router.get("/sales/orders/{id}")
async def get_order(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_order(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Order retrieved successfully")


@router.get("/sales/orders/{id}/invoice.pdf")
async def download_order_invoice_pdf(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    filename, content = await service.generate_order_invoice_pdf(db, current_user.tenant_id, id)
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


class ArchiveReason(BaseModel):
    reason: str = Field(default="", max_length=500)


def _require_owner(user) -> None:
    from app.core.deps import may_delete
    if not may_delete(user):
        raise ForbiddenError("Only business owners and administrators can do this.")


@router.post("/sales/orders/{id}/correct")
async def correct_order(id: uuid.UUID, data: OrderCorrection, db: DbSession, current_user: CurrentUser):
    """Owner/administrator correction of a completed sale: reverses the old books entry and posts a new one. Never edits in place."""
    _require_tenant(current_user.tenant_id)
    _require_owner(current_user)
    obj = await service.correct_order(db, current_user.tenant_id, id, data, current_user.id, current_user.full_name or current_user.email)
    return success_response(data=obj.model_dump(), message="Sale corrected")


@router.post("/sales/orders/{id}/archive")
async def archive_order(id: uuid.UUID, data: ArchiveReason, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    _require_owner(current_user)
    obj = await service.archive_order(db, current_user.tenant_id, id, current_user.id, current_user.full_name or current_user.email, data.reason)
    return success_response(data=obj.model_dump(), message="Sale archived")


@router.post("/sales/orders/{id}/restore")
async def restore_order(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    _require_owner(current_user)
    obj = await service.archive_order(db, current_user.tenant_id, id, current_user.id, current_user.full_name or current_user.email, "", restore=True)
    return success_response(data=obj.model_dump(), message="Sale restored")


class InvoiceEmail(BaseModel):
    kind: Literal["invoice", "receipt"] = "invoice"
    to: EmailStr | None = None
    message: str | None = Field(default=None, max_length=1000)


@router.post("/sales/orders/{id}/invoice/email")
async def email_order_invoice(id: uuid.UUID, data: InvoiceEmail, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    from app.modules.sales.service.invoice_share import email_invoice
    return success_response(data=await email_invoice(db, current_user.tenant_id, id, current_user, data.to, data.message, data.kind), message="Invoice emailed")


@router.patch("/sales/orders/{id}")
async def update_order(id: uuid.UUID, data: OrderUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    if data.ordered_at is not None:
        _require_owner(current_user)
    obj = await service.update_order(
        db, current_user.tenant_id, id, data,
        user_id=current_user.id, user_name=current_user.full_name or current_user.email,
    )
    return success_response(data=obj.model_dump(), message="Order updated successfully")


@router.post("/sales/orders/{id}/approve", dependencies=[Depends(require_permission("credit:approve"))])
async def approve_order(id: uuid.UUID, db: DbSession, current_user: CurrentUser, data: OrderDecision | None = None):
    _require_tenant(current_user.tenant_id)
    obj = await service.approve_order(
        db, current_user.tenant_id, id, current_user.id, current_user.full_name or current_user.email, data.note if data else None,
    )
    return success_response(data=obj.model_dump(), message="Credit sale approved")


@router.post("/sales/orders/{id}/reject", dependencies=[Depends(require_permission("credit:approve"))])
async def reject_order(id: uuid.UUID, db: DbSession, current_user: CurrentUser, data: OrderDecision | None = None):
    _require_tenant(current_user.tenant_id)
    obj = await service.reject_order(
        db, current_user.tenant_id, id, current_user.id, current_user.full_name or current_user.email, data.note if data else None,
    )
    return success_response(data=obj.model_dump(), message="Credit sale rejected")


@router.delete("/sales/orders/{id}")
async def delete_order(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_order(
        db, current_user.tenant_id, id,
        user_id=current_user.id, user_name=current_user.full_name or current_user.email,
    )
    return success_response(message="Order deleted successfully")
