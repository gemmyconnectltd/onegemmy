"""Route authorization shared by sales history and payment endpoints."""
import uuid

from fastapi import Request

from app.core.deps import ActiveBranchId, CurrentUser, DbSession, require_permission
from app.core.exceptions import ForbiddenError
from app.modules.sales.repository import OrderPaymentRepository, OrderRepository


async def order_access(request: Request, db: DbSession, user: CurrentUser, branch: ActiveBranchId):
    action = {"GET": "read", "POST": "create", "PATCH": "update", "DELETE": "delete"}[request.method]
    if request.url.path.endswith(("/approve", "/reject")):
        await require_permission("credit:approve")(user)
    else:
        await require_permission(f"orders:{action}")(user)
    id = request.path_params.get("id")
    payment_id = request.path_params.get("payment_id")
    if payment_id:
        payment = await OrderPaymentRepository(db).get_by_id_for_tenant(user.tenant_id, uuid.UUID(payment_id))
        id = str(payment.order_id) if payment else None
    if id:
        order = await OrderRepository(db).get_by_id_for_tenant(user.tenant_id, uuid.UUID(id))
        if order and branch and order.branch_id != branch:
            raise ForbiddenError("This sale belongs to another branch")
    if request.method == "PATCH":
        data = await request.json()
        if branch and "branch_id" in data and data["branch_id"] != str(branch):
            raise ForbiddenError("A sale cannot be moved outside the active branch")
