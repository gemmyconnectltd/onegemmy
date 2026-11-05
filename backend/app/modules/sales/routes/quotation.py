import uuid
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Request, Response

from app.core.deps import ActiveBranchId, CurrentUser, DbSession, require_permission
from app.core.exceptions import ForbiddenError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.sales import service
from app.modules.sales.schemas.quotation import QuotationCreate, QuotationReject, QuotationUpdate
from app.modules.sales.service import quotation as quotes


async def quotation_access(request: Request, user: CurrentUser):
    """Quotations ride on the sales permissions: whoever may read / create / edit sales may do the same with an offer."""
    await require_permission(f"orders:{ {'GET': 'read', 'POST': 'create', 'PATCH': 'update', 'DELETE': 'delete'}[request.method] }")(user)


router = APIRouter(tags=["Sales - Quotations"], dependencies=[Depends(quotation_access)])


async def _scope(db, user, salesperson_id):
    return await service.own_sales_scope(db, user) or salesperson_id


async def _own_only(db, user, q) -> None:
    own = await service.own_sales_scope(db, user)
    if own is not None and own not in (q.salesperson_id, q.created_by):
        raise ForbiddenError("You can only open your own quotations")


@router.get("/sales/quotations")
async def list_quotations(db: DbSession, user: CurrentUser, page: PageQuery, status: str | None = Query(None), search: str | None = Query(None),
                          salesperson_id: uuid.UUID | None = Query(None), customer_id: uuid.UUID | None = Query(None)):
    items, total = await quotes.list_quotations(db, user.tenant_id, status=status, search=search, salesperson_id=await _scope(db, user, salesperson_id),
                                                customer_id=customer_id, offset=page.offset, limit=page.limit)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page.page, page_size=page.page_size, message="Quotations retrieved")


@router.post("/sales/quotations")
async def create_quotation(data: QuotationCreate, db: DbSession, user: CurrentUser, branch: ActiveBranchId):
    q = await quotes.create_quotation(db, user.tenant_id, user.id, user.full_name, data, branch)
    return success_response(data=q.model_dump(), message="Quotation created", status_code=201)


@router.get("/sales/quotations/{id}")
async def get_quotation(id: uuid.UUID, db: DbSession, user: CurrentUser):
    q = await quotes.get_quotation(db, user.tenant_id, id)
    await _own_only(db, user, q)
    return success_response(data=q.model_dump(), message="Quotation retrieved")


@router.get("/sales/quotations/{id}/activity")
async def quotation_activity(id: uuid.UUID, db: DbSession, user: CurrentUser):
    await _own_only(db, user, await quotes.get_quotation(db, user.tenant_id, id))
    return success_response(data=await quotes.quotation_activity(db, user.tenant_id, id), message="Quotation activity retrieved")


@router.patch("/sales/quotations/{id}")
async def update_quotation(id: uuid.UUID, data: QuotationUpdate, db: DbSession, user: CurrentUser):
    await _own_only(db, user, await quotes.get_quotation(db, user.tenant_id, id))
    q = await quotes.update_quotation(db, user.tenant_id, id, user.id, user.full_name, data)
    return success_response(data=q.model_dump(), message="Quotation updated")


@router.post("/sales/quotations/{id}/send")
async def send_quotation(id: uuid.UUID, db: DbSession, user: CurrentUser):
    await _own_only(db, user, await quotes.get_quotation(db, user.tenant_id, id))
    return success_response(data=(await quotes.send_quotation(db, user.tenant_id, id, user.id, user.full_name)).model_dump(), message="Quotation marked as sent")


@router.post("/sales/quotations/{id}/accept")
async def accept_quotation(id: uuid.UUID, db: DbSession, user: CurrentUser):
    await _own_only(db, user, await quotes.get_quotation(db, user.tenant_id, id))
    return success_response(data=(await quotes.accept_quotation(db, user.tenant_id, id, user.id, user.full_name)).model_dump(), message="Quotation accepted")


@router.post("/sales/quotations/{id}/reject")
async def reject_quotation(id: uuid.UUID, data: QuotationReject, db: DbSession, user: CurrentUser):
    await _own_only(db, user, await quotes.get_quotation(db, user.tenant_id, id))
    q = await quotes.reject_quotation(db, user.tenant_id, id, user.id, user.full_name, data.reason)
    return success_response(data=q.model_dump(), message="Quotation rejected")


@router.post("/sales/quotations/{id}/convert")
async def convert_quotation(id: uuid.UUID, db: DbSession, user: CurrentUser, branch: ActiveBranchId):
    """Accepted quotation -> one Pending sale. Repeating the call returns the same sale. Takes no payment and moves no stock."""
    await _own_only(db, user, await quotes.get_quotation(db, user.tenant_id, id))
    q, created = await quotes.convert_quotation(db, user.tenant_id, id, user.id, user.full_name, branch)
    return success_response(data=q.model_dump(), message="Sale created from the quotation" if created else "This quotation was already converted", status_code=201 if created else 200)


@router.get("/sales/quotations/{id}/quotation.pdf")
async def quotation_pdf(id: uuid.UUID, db: DbSession, user: CurrentUser):
    await _own_only(db, user, await quotes.get_quotation(db, user.tenant_id, id))
    filename, content = await service.generate_quotation_pdf(db, user.tenant_id, id)
    return Response(content=content, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"})
