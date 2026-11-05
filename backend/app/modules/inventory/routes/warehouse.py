import uuid
from datetime import date

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ForbiddenError, ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.inventory.models.warehouse import MOVEMENT_TYPES
from app.modules.inventory.service import warehouse as svc

router = APIRouter(tags=["Inventory - Warehouses"])


def _tenant(user) -> uuid.UUID:
    if user.tenant_id is None:
        raise ValidationError("This account has no tenant.")
    return user.tenant_id


def _assigned(user, permission: str) -> bool:
    """Whether the person was actually GIVEN this permission. The everyone-can-view-and-edit baseline does not count: running warehouses is not for everyone."""
    return bool(user.is_superuser or (user.role or "").lower() in ("admin", "owner", "owner/ceo") or permission in user.role_permissions_names)


def _require(user, permission: str) -> None:
    if not _assigned(user, permission):
        raise ForbiddenError(f"Permission required: {permission}")


class WarehouseIn(BaseModel):
    code: str | None = Field(default=None, max_length=30)
    name: str = Field(min_length=1, max_length=150)
    branch_id: uuid.UUID | None = None
    manager_id: uuid.UUID | None = None
    address: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=2000)


class WarehousePatch(BaseModel):
    code: str | None = Field(default=None, max_length=30)
    name: str | None = Field(default=None, min_length=1, max_length=150)
    branch_id: uuid.UUID | None = None
    manager_id: uuid.UUID | None = None
    address: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=2000)


class ReceiptLine(BaseModel):
    product_id: uuid.UUID
    variant_id: uuid.UUID | None = None
    quantity: float = Field(gt=0, allow_inf_nan=False)


class ReceiptIn(BaseModel):
    lines: list[ReceiptLine] = Field(min_length=1, max_length=200)
    reference: str | None = Field(default=None, max_length=50)
    note: str | None = Field(default=None, max_length=500)


class CountLine(BaseModel):
    product_id: uuid.UUID
    variant_id: uuid.UUID | None = None
    counted_quantity: float = Field(ge=0, allow_inf_nan=False)


class CountIn(BaseModel):
    warehouse_id: uuid.UUID
    lines: list[CountLine] = Field(min_length=1, max_length=500)
    note: str | None = Field(default=None, max_length=1000)


class DecisionIn(BaseModel):
    note: str | None = Field(default=None, max_length=500)


@router.get("/inventory/warehouses")
async def list_warehouses(db: DbSession, user: CurrentUser):
    return success_response(data=await svc.list_warehouses(db, _tenant(user)), message="Warehouses retrieved")


@router.post("/inventory/warehouses/setup")
async def setup(db: DbSession, user: CurrentUser):
    """Switch warehouses on for the business: creates the Main warehouse holding everything now in stock."""
    _require(user, "warehouses:create")
    return success_response(data=await svc.setup_warehouses(db, _tenant(user), user), message="Warehouses are on", status_code=201)


@router.post("/inventory/warehouses")
async def create_warehouse(data: WarehouseIn, db: DbSession, user: CurrentUser):
    _require(user, "warehouses:create")
    return success_response(data=await svc.create_warehouse(db, _tenant(user), user, data.model_dump()), message="Warehouse created", status_code=201)


@router.patch("/inventory/warehouses/{id}")
async def update_warehouse(id: uuid.UUID, data: WarehousePatch, db: DbSession, user: CurrentUser):
    _require(user, "warehouses:update")
    return success_response(data=await svc.update_warehouse(db, _tenant(user), user, id, data.model_dump(exclude_unset=True)), message="Warehouse updated")


@router.post("/inventory/warehouses/{id}/activate")
async def activate(id: uuid.UUID, db: DbSession, user: CurrentUser):
    _require(user, "warehouses:update")
    return success_response(data=await svc.set_active(db, _tenant(user), user, id, True), message="Warehouse activated")


@router.post("/inventory/warehouses/{id}/deactivate")
async def deactivate(id: uuid.UUID, db: DbSession, user: CurrentUser):
    _require(user, "warehouses:update")
    return success_response(data=await svc.set_active(db, _tenant(user), user, id, False), message="Warehouse deactivated")


@router.post("/inventory/warehouses/{id}/make-default")
async def make_default(id: uuid.UUID, db: DbSession, user: CurrentUser):
    _require(user, "warehouses:update")
    return success_response(data=await svc.make_default(db, _tenant(user), user, id), message="Default warehouse changed")


@router.post("/inventory/warehouses/{id}/receive")
async def receive(id: uuid.UUID, data: ReceiptIn, db: DbSession, user: CurrentUser):
    _require(user, "stock:create")
    return success_response(data=await svc.receive_stock(db, _tenant(user), user, id, [line.model_dump() for line in data.lines], data.note, data.reference), message="Stock received", status_code=201)


@router.get("/inventory/stock-by-warehouse")
async def stock_by_warehouse(db: DbSession, user: CurrentUser, page: PageQuery, warehouse_id: uuid.UUID | None = None, branch_id: uuid.UUID | None = None,
                             search: str | None = Query(None, max_length=100), status: str | None = Query(None, pattern="^(ok|low|out)$")):
    rows, total = await svc.stock_rows(db, _tenant(user), warehouse_id=warehouse_id, branch_id=branch_id, search=search, status=status, offset=page.offset, limit=page.limit)
    return paginated_response(items=rows, total=total, page=page.page, page_size=page.page_size, message="Stock retrieved")


@router.get("/inventory/stock-movements")
async def stock_movements(db: DbSession, user: CurrentUser, page: PageQuery, warehouse_id: uuid.UUID | None = None, product_id: uuid.UUID | None = None,
                          movement_type: str | None = Query(None), from_date: date | None = None, to_date: date | None = None):
    if movement_type and movement_type not in MOVEMENT_TYPES:
        raise ValidationError("Unknown movement type")
    rows, total = await svc.movements(db, _tenant(user), warehouse_id=warehouse_id, product_id=product_id, movement_type=movement_type, start=from_date, end=to_date, offset=page.offset, limit=page.limit)
    return paginated_response(items=rows, total=total, page=page.page, page_size=page.page_size, message="Movements retrieved")


@router.get("/inventory/stock-counts")
async def list_counts(db: DbSession, user: CurrentUser, page: PageQuery, status: str | None = Query(None, pattern="^(Submitted|Approved|Rejected)$")):
    rows, total = await svc.list_counts(db, _tenant(user), status=status, offset=page.offset, limit=page.limit)
    return paginated_response(items=rows, total=total, page=page.page, page_size=page.page_size, message="Stock counts retrieved")


@router.post("/inventory/stock-counts")
async def submit_count(data: CountIn, db: DbSession, user: CurrentUser):
    _require(user, "stock:create")
    result = await svc.submit_count(db, _tenant(user), user, data.warehouse_id, [line.model_dump() for line in data.lines], data.note, _assigned(user, "stock:approve"))
    return success_response(data=result, message="Stock count submitted", status_code=201)


@router.get("/inventory/stock-counts/{id}")
async def get_count(id: uuid.UUID, db: DbSession, user: CurrentUser):
    return success_response(data=await svc.get_count(db, _tenant(user), id), message="Stock count retrieved")


@router.post("/inventory/stock-counts/{id}/approve")
async def approve_count(id: uuid.UUID, db: DbSession, user: CurrentUser, data: DecisionIn | None = None):
    _require(user, "stock:approve")
    return success_response(data=await svc.decide_count(db, _tenant(user), user, id, True, data.note if data else None), message="Count approved and applied")


@router.post("/inventory/stock-counts/{id}/reject")
async def reject_count(id: uuid.UUID, data: DecisionIn, db: DbSession, user: CurrentUser):
    _require(user, "stock:approve")
    return success_response(data=await svc.decide_count(db, _tenant(user), user, id, False, data.note), message="Count rejected")
