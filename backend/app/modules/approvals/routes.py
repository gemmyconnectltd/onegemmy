import uuid
from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ForbiddenError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.approvals import service
from app.modules.approvals.models import ApprovalRequest
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.order import Order

router = APIRouter(prefix="/tenants/approvals", tags=["Approvals"])

CREATE_NEEDS = {"price_change": ("items:update", "pricing:update"), "stock_adjustment": ("items:update", "stock:update", "stock:create")}


def _tenant(user):
    if user.tenant_id is None:
        raise ForbiddenError("Approvals belong to a business account")


class NewRequest(BaseModel):
    kind: Literal["price_change", "stock_adjustment"]
    subject_id: uuid.UUID  # the product
    variant_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
    new_price: float | None = Field(None, ge=0)
    new_stock: float | None = Field(None, ge=0)
    reason: str = Field(min_length=5, max_length=1000)


class Decision(BaseModel):
    note: str | None = Field(None, max_length=1000)


@router.get("")
async def list_requests(db: DbSession, user: CurrentUser, page: PageQuery, status: Literal["pending", "approved", "rejected", "cancelled"] | None = None,
                        kind: str | None = Query(None, max_length=30), mine: bool = False):
    """The inbox. People with approval authority (or approvals:read) see every request; everyone else sees only their own."""
    _tenant(user)
    items, total = await service.list_requests(db, user, status=status, kind=kind, mine=mine, offset=page.offset, limit=page.limit)
    return paginated_response(items=items, total=total, page=page.page, page_size=page.page_size, message="Requests retrieved")


@router.get("/summary")
async def summary(db: DbSession, user: CurrentUser):
    _tenant(user)
    pending = (await db.execute(select(func.count()).select_from(ApprovalRequest).where(ApprovalRequest.tenant_id == user.tenant_id, ApprovalRequest.status == "pending"))).scalar_one()
    mine = (await db.execute(select(func.count()).select_from(ApprovalRequest).where(ApprovalRequest.tenant_id == user.tenant_id, ApprovalRequest.status == "pending", ApprovalRequest.requested_by == user.id))).scalar_one()
    authority = service.can_decide(user)
    credit = (await db.execute(select(func.count()).select_from(Order).where(Order.tenant_id == user.tenant_id, Order.status == "Awaiting Approval"))).scalar_one() if (authority or user.is_superuser or "credit:approve" in user.permissions_names) else 0
    return success_response(data={"can_decide": authority, "pending": pending if authority else mine, "mine_pending": mine, "credit_awaiting": credit}, message="Summary retrieved")


@router.get("/credit")
async def credit_awaiting(db: DbSession, user: CurrentUser):
    """Credit sales held because they went over the credit limit. They are decided with the existing order approve / reject actions."""
    _tenant(user)
    if not (user.is_superuser or "credit:approve" in user.permissions_names):
        raise ForbiddenError("Permission required: credit:approve")
    rows = (await db.execute(
        select(Order.id, Order.order_number, Order.total, Order.requested_paid, Order.branch_id, Order.ordered_at, Customer.name)
        .outerjoin(Customer, Customer.id == Order.customer_id).where(Order.tenant_id == user.tenant_id, Order.status == "Awaiting Approval").order_by(Order.ordered_at.desc()).limit(100)
    )).all()
    return success_response(data=[{"id": str(i), "number": n, "total": t, "paid": p, "branch_id": str(b) if b else None, "at": a.isoformat() if a else None, "customer": c or "Walk-in"} for i, n, t, p, b, a, c in rows], message="Credit sales retrieved")


@router.post("", status_code=201)
async def create(data: NewRequest, db: DbSession, user: CurrentUser):
    _tenant(user)
    if not (user.is_superuser or set(CREATE_NEEDS[data.kind]) & set(user.permissions_names)):
        raise ForbiddenError("You can only ask for changes to things you may edit yourself")
    payload = {"variant_id": str(data.variant_id) if data.variant_id else None, "new_price": data.new_price, "new_stock": data.new_stock}
    request = await service.create_request(db, user, kind=data.kind, subject_id=data.subject_id, branch_id=data.branch_id, reason=data.reason, payload=payload)
    return success_response(data=service.to_dict(request), message="Request sent", status_code=201)


@router.post("/{request_id}/approve")
async def approve(request_id: uuid.UUID, db: DbSession, user: CurrentUser, data: Decision | None = None):
    _tenant(user)
    return success_response(data=service.to_dict(await service.decide(db, user, request_id, approve=True, note=data.note if data else None)), message="Approved")


@router.post("/{request_id}/reject")
async def reject(request_id: uuid.UUID, db: DbSession, user: CurrentUser, data: Decision | None = None):
    _tenant(user)
    return success_response(data=service.to_dict(await service.decide(db, user, request_id, approve=False, note=data.note if data else None)), message="Rejected")


@router.post("/{request_id}/cancel")
async def cancel(request_id: uuid.UUID, db: DbSession, user: CurrentUser):
    _tenant(user)
    return success_response(data=service.to_dict(await service.cancel(db, user, request_id)), message="Request withdrawn")
