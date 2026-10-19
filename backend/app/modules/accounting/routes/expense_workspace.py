import uuid

from fastapi import APIRouter, File, Query, UploadFile
from fastapi.responses import FileResponse

from app.core.deps import ActiveBranchId, CurrentUser, DbSession
from app.core.pagination import PageQuery
from app.core.response import success_response
from app.modules.accounting.schemas.expense import ExpenseCreate, ExpenseUpdate
from app.modules.accounting.schemas.expense_workspace import ExpenseCategoryInput, ExpenseFilters
from app.modules.accounting.service import expense_workspace as service

router = APIRouter(prefix="/expense-management", tags=["Expense Management"])


@router.post("/search")
async def search(
    data: ExpenseFilters, db: DbSession, user: CurrentUser, branch: ActiveBranchId, page: PageQuery
):
    return success_response(
        await service.page(db, user, branch, data, page.page, min(page.page_size, 100))
    )


@router.post("/overview")
async def overview(data: ExpenseFilters, db: DbSession, user: CurrentUser, branch: ActiveBranchId):
    return success_response(await service.page(db, user, branch, data, 1, 5, True))


@router.get("/categories")
async def categories(
    db: DbSession, user: CurrentUser, page: PageQuery, search: str = Query("", max_length=100)
):
    return success_response(await service.categories(db, user, page.page, search))


@router.post("/categories")
async def create_category(data: ExpenseCategoryInput, db: DbSession, user: CurrentUser):
    return success_response(await service.save_category(db, user, data), status_code=201)


@router.patch("/categories/{identity}")
async def edit_category(
    identity: uuid.UUID, data: ExpenseCategoryInput, db: DbSession, user: CurrentUser
):
    return success_response(await service.save_category(db, user, data, identity))


@router.post("")
async def create(data: ExpenseCreate, db: DbSession, user: CurrentUser, branch: ActiveBranchId):
    return success_response(
        (await service.create(db, user, branch, data)).model_dump(), status_code=201
    )


@router.get("/{identity}")
async def detail(
    identity: uuid.UUID,
    db: DbSession,
    user: CurrentUser,
    branch: ActiveBranchId,
    history_page: int = Query(1, ge=1),
):
    return success_response(await service.detail(db, user, branch, identity, history_page))


@router.patch("/{identity}")
async def edit(
    identity: uuid.UUID,
    data: ExpenseUpdate,
    db: DbSession,
    user: CurrentUser,
    branch: ActiveBranchId,
):
    return success_response((await service.edit(db, user, branch, identity, data)).model_dump())


@router.post("/{identity}/{action}")
async def act(
    identity: uuid.UUID, action: str, db: DbSession, user: CurrentUser, branch: ActiveBranchId
):
    from app.core.exceptions import ValidationError

    if action not in ("approve", "reject", "delete"):
        raise ValidationError("Unknown expense action")
    result = await service.act(db, user, branch, identity, action)
    return success_response(result.model_dump() if result else None)


@router.put("/{identity}/receipt")
async def attach(
    identity: uuid.UUID,
    db: DbSession,
    user: CurrentUser,
    branch: ActiveBranchId,
    file: UploadFile = File(...),
):
    content = await file.read(service.MAX_RECEIPT + 1)
    return success_response(
        await service.attach(db, user, branch, identity, content, file.filename or "receipt")
    )


@router.get("/{identity}/receipt")
async def receipt(identity: uuid.UUID, db: DbSession, user: CurrentUser, branch: ActiveBranchId):
    path, name, kind = await service.receipt(db, user, branch, identity)
    return FileResponse(
        path,
        filename=name,
        media_type=kind,
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )
