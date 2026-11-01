import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, File, Query, UploadFile

from app.core.deps import ActiveBranchId, CurrentUser, DbSession
from app.core.exceptions import NotFoundError, ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.procurement import service
from app.modules.procurement.repository import PurchaseOrderRepository
from app.modules.procurement.schemas import PurchaseCreate, PurchaseUpdate
from app.modules.procurement.schemas.purchase import ReceiptCreate
from app.modules.procurement.schemas.supplier_bill import ReceiveTerms

router = APIRouter(tags=["Procurement - Purchase Orders"])


async def _access(db, user, branch, action, identity=None):
    from app.modules.accounting.service.workspace import allow, resolve_branch

    tenant = allow(user, "purchase_orders", action)
    scoped = await resolve_branch(db, user, None, branch)
    if identity:
        record = await PurchaseOrderRepository(db).get_by_id_for_tenant(tenant, identity)
        if record is None or (scoped and record.branch_id != scoped):
            raise NotFoundError("Purchase not found in this branch")
    return scoped


@router.get("/procurement/purchase-orders")
async def list_purchase_orders(db: DbSession, current_user: CurrentUser, page_params: PageQuery, branch: ActiveBranchId, status: str | None = None, search: str | None = Query(None, max_length=100), from_date: date | None = None, to_date: date | None = None, supplier_id: uuid.UUID | None = None, currency_code: str | None = None, sort: Literal["created", "reference", "total", "expected"] = "created", direction: Literal["asc", "desc"] = "desc"):
    from app.modules.accounting.service.workspace import allow, resolve_branch

    tenant = allow(current_user, "purchase_orders")
    branch_id = await resolve_branch(db, current_user, None, branch)
    if from_date and to_date and from_date > to_date:
        raise ValidationError("Start date must not follow end date")
    filters = {"search": search, "from_date": from_date, "to_date": to_date, "branch_id": branch_id, "supplier_id": supplier_id, "currency_code": currency_code, "sort": sort, "direction": direction}
    size = min(page_params.page_size, 100)
    items = await service.list_purchases(db, tenant, status, (page_params.page - 1) * size, size, **filters)
    total = await service.count_purchases(db, tenant, status, **filters)
    summary = await PurchaseOrderRepository(db).history_summary(tenant, **filters)
    return paginated_response(items=[_purchase_payload(i, current_user) for i in items], total=total, page=page_params.page, page_size=size, message="Purchase history retrieved", summary=summary)


@router.get("/procurement/overview")
async def purchase_overview(db: DbSession, current_user: CurrentUser, branch: ActiveBranchId,
                            from_date: date | None = None, to_date: date | None = None,
                            supplier_id: uuid.UUID | None = None, currency_code: str | None = None):
    from app.modules.accounting.service.workspace import allow
    from app.modules.procurement.repository.workspace import PurchasingWorkspaceRepository
    tenant = allow(current_user, "purchase_orders")
    scoped = await _access(db, current_user, branch, "read")
    if from_date and to_date and from_date > to_date:
        raise ValidationError("Start date must not follow end date")
    data = await PurchasingWorkspaceRepository(db).overview(tenant, branch_id=scoped,
        from_date=from_date, to_date=to_date, supplier_id=supplier_id, currency_code=currency_code)
    if not current_user.is_superuser and "accounts_payable:read" not in current_user.permissions_names:
        data["outstanding"] = []
    return success_response(data=data)


@router.get("/procurement/goods-receipts")
async def list_goods_receipts(db: DbSession, current_user: CurrentUser, branch: ActiveBranchId,
                             page_params: PageQuery, purchase_order_id: uuid.UUID | None = None):
    from app.modules.procurement.repository.receipt import ReceiptRepository
    from app.modules.procurement.schemas.purchase import ReceiptRead
    scoped = await _access(db, current_user, branch, "read")
    rows, total = await ReceiptRepository(db).page(current_user.tenant_id, scoped,
        purchase_order_id, page_params.offset, min(page_params.limit, 100))
    data = []
    for row in rows:
        read = ReceiptRead.model_validate(row)
        read.po_reference = row.purchase_order.reference
        read.supplier_name = row.purchase_order.supplier.name if row.purchase_order.supplier else None
        read.currency_code = row.purchase_order.currency_code
        data.append(read.model_dump())
    return paginated_response(items=data, total=total, page=page_params.page,
        page_size=min(page_params.page_size, 100))


@router.post("/procurement/purchase-orders")
async def create_purchase_order(data: PurchaseCreate, db: DbSession, current_user: CurrentUser, active_branch_id: ActiveBranchId):
    active_branch_id = await _access(db, current_user, active_branch_id, "create")
    if data.branch_id:
        from app.modules.accounting.service.workspace import resolve_branch
        active_branch_id = await resolve_branch(db, current_user, data.branch_id, active_branch_id)
    obj = await service.create_purchase(db, current_user.tenant_id, current_user.id, data, active_branch_id)
    return success_response(data=_purchase_payload(obj, current_user), message="Purchase order created successfully", status_code=201)


@router.get("/procurement/purchase-orders/export/csv")
async def export_purchase_orders(db: DbSession, current_user: CurrentUser, branch: ActiveBranchId,
                                 status: str | None = None, search: str | None = Query(None, max_length=100),
                                 from_date: date | None = None, to_date: date | None = None,
                                 supplier_id: uuid.UUID | None = None, currency_code: str | None = None,
                                 sort: Literal["created", "reference", "total", "expected"] = "created",
                                 direction: Literal["asc", "desc"] = "desc"):
    from fastapi.responses import StreamingResponse

    from app.modules.procurement.service.export import purchase_csv
    scoped = await _access(db, current_user, branch, "read")
    if from_date and to_date and from_date > to_date:
        raise ValidationError("Start date must not follow end date")
    return StreamingResponse(purchase_csv(db, current_user.tenant_id, status,
        branch_id=scoped, search=search, from_date=from_date, to_date=to_date,
        supplier_id=supplier_id, currency_code=currency_code, sort=sort, direction=direction),
        media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="purchase-orders.csv"'})


@router.get("/procurement/purchase-orders/{id}")
async def get_purchase_order(id: uuid.UUID, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    await _access(db, current_user, branch, "read", id)
    obj = await service.get_purchase(db, current_user.tenant_id, id)
    return success_response(data=_purchase_payload(obj, current_user), message="Purchase order retrieved successfully")


@router.patch("/procurement/purchase-orders/{id}")
async def update_purchase_order(id: uuid.UUID, data: PurchaseUpdate, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    await _access(db, current_user, branch, "update", id)
    if data.branch_id:
        from app.modules.accounting.service.workspace import resolve_branch
        await resolve_branch(db, current_user, data.branch_id, branch)
    obj = await service.update_purchase(db, current_user.tenant_id, id, data, current_user.id)
    return success_response(data=_purchase_payload(obj, current_user), message="Purchase order updated successfully")


@router.post("/procurement/purchase-orders/{id}/receive")
async def receive_purchase_order(id: uuid.UUID, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId, data: ReceiveTerms | None = None):
    await _access(db, current_user, branch, "update", id)
    obj = await service.receive_purchase(db, current_user.tenant_id, id, current_user.id, data.due_date if data else None)
    return success_response(data=_purchase_payload(obj, current_user), message="Purchase order received and stock updated")


@router.post("/procurement/purchase-orders/{id}/cancel")
async def cancel_purchase_order(id: uuid.UUID, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    await _access(db, current_user, branch, "update", id)
    obj = await service.cancel_purchase(db, current_user.tenant_id, id, current_user.id)
    return success_response(data=_purchase_payload(obj, current_user), message="Purchase order cancelled")


@router.delete("/procurement/purchase-orders/{id}")
async def delete_purchase_order(id: uuid.UUID, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    await _access(db, current_user, branch, "delete", id)
    await service.delete_purchase(db, current_user.tenant_id, id)
    return success_response(message="Purchase order deleted successfully")


@router.post("/procurement/purchase-orders/{id}/receipts")
async def confirm_goods_receipt(id: uuid.UUID, data: ReceiptCreate, db: DbSession,
                               current_user: CurrentUser, branch: ActiveBranchId):
    from app.modules.procurement.service.purchase import confirm_receipt
    await _access(db, current_user, branch, "update", id)
    obj = await confirm_receipt(db, current_user.tenant_id, id, current_user.id, data)
    return success_response(data=_purchase_payload(obj, current_user), message="Receipt confirmed; stock and bill posted")


@router.post("/procurement/purchase-orders/{id}/actions/{action}")
async def purchase_action(id: uuid.UUID, action: Literal["submit", "approve", "send", "close"],
                          db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    from app.modules.procurement.service.purchase import transition_purchase
    await _access(db, current_user, branch, "approve" if action == "approve" else "update", id)
    obj = await transition_purchase(db, current_user.tenant_id, id, current_user.id, action)
    return success_response(data=_purchase_payload(obj, current_user))


@router.get("/procurement/purchase-orders/{id}/activity")
async def purchase_activity(id: uuid.UUID, db: DbSession, current_user: CurrentUser,
                            branch: ActiveBranchId, page_params: PageQuery):
    from app.modules.procurement.repository.workspace import PurchasingWorkspaceRepository
    await _access(db, current_user, branch, "read", id)
    rows, total = await PurchasingWorkspaceRepository(db).activity(current_user.tenant_id, id,
        page_params.offset, min(page_params.limit, 100))
    return paginated_response(items=rows, total=total, page=page_params.page,
                              page_size=min(page_params.page_size, 100))


@router.get("/procurement/purchase-orders/{id}/pdf")
async def purchase_document(id: uuid.UUID, db: DbSession, current_user: CurrentUser,
                            branch: ActiveBranchId):
    import os

    from fastapi.responses import FileResponse
    from starlette.background import BackgroundTask

    from app.modules.procurement.service.export import purchase_pdf
    await _access(db, current_user, branch, "read", id)
    path, filename = await purchase_pdf(db, current_user.tenant_id, id)
    return FileResponse(path, media_type="application/pdf", filename=filename,
                        background=BackgroundTask(os.unlink, path))


@router.get("/procurement/purchase-orders/{id}/attachments")
async def purchase_attachments(id: uuid.UUID, db: DbSession, current_user: CurrentUser,
                               branch: ActiveBranchId):
    from app.modules.procurement.repository.attachment import PurchaseAttachmentRepository
    from app.modules.procurement.service.attachment import public_attachment
    await _access(db, current_user, branch, "read", id)
    rows = await PurchaseAttachmentRepository(db).for_order(current_user.tenant_id, id)
    return success_response(data=[public_attachment(row) for row in rows])


@router.post("/procurement/purchase-orders/{id}/attachments")
async def upload_purchase_attachment(id: uuid.UUID, db: DbSession, current_user: CurrentUser,
                                     branch: ActiveBranchId, file: UploadFile = File(...)):
    from app.modules.procurement.service.attachment import MAX_SIZE, attach
    await _access(db, current_user, branch, "update", id)
    content = await file.read(MAX_SIZE + 1)
    obj = await attach(db, current_user.tenant_id, id, current_user.id, file.filename or "Document", content)
    return success_response(data=obj, status_code=201)


@router.get("/procurement/purchase-orders/{id}/attachments/{attachment_id}")
async def download_purchase_attachment(id: uuid.UUID, attachment_id: uuid.UUID,
                                       db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    from urllib.parse import quote

    from fastapi.responses import Response

    from app.integrations.storage import storage
    from app.modules.procurement.repository.attachment import PurchaseAttachmentRepository
    await _access(db, current_user, branch, "read", id)
    obj = await PurchaseAttachmentRepository(db).for_download(current_user.tenant_id, id, attachment_id)
    if obj is None:
        raise NotFoundError("Attachment not found")
    try:
        content = await storage.read(obj.storage_key)
    except FileNotFoundError as exc:
        raise NotFoundError("Attachment file is no longer available") from exc
    return Response(content=content, media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(obj.name, safe='')}",
                 "X-Content-Type-Options": "nosniff"})


def _purchase_payload(obj, user) -> dict:
    excluded = set() if user.is_superuser or "accounts_payable:read" in user.permissions_names else {"payment_status"}
    return obj.model_dump(exclude=excluded)
