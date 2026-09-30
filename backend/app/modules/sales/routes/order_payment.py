import uuid

from fastapi import APIRouter, Depends

from app.core.deps import CurrentUser, DbSession, require_permission
from app.core.exceptions import ValidationError
from app.core.response import success_response
from app.modules.sales import service
from app.modules.sales.schemas import OrderPaymentCreate, OrderPaymentReverse

router = APIRouter(tags=["Sales - Payments"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/sales/orders/{id}/payments")
async def list_order_payments(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    items = await service.list_payments_for_order(db, current_user.tenant_id, id)
    return success_response(data=[i.model_dump() for i in items], message="Payments retrieved successfully")


@router.post(
    "/sales/orders/{id}/payments",
    dependencies=[Depends(require_permission("accounts_receivable:create"))],
)
async def record_order_payment(id: uuid.UUID, data: OrderPaymentCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.record_payment(
        db, current_user.tenant_id, current_user.id, current_user.full_name or current_user.email, id, data,
    )
    return success_response(data=obj.model_dump(), message="Payment recorded successfully", status_code=201)


@router.post(
    "/sales/payments/{payment_id}/reverse",
    dependencies=[Depends(require_permission("accounts_receivable:delete"))],
)
async def reverse_order_payment(payment_id: uuid.UUID, data: OrderPaymentReverse, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.reverse_payment(
        db, current_user.tenant_id, current_user.id, current_user.full_name or current_user.email, payment_id, data,
    )
    return success_response(data=obj.model_dump(), message="Payment reversed successfully")
