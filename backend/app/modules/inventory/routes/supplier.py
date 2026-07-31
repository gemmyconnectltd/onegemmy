import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.inventory import service
from app.modules.inventory.schemas import SupplierCreate, SupplierUpdate

router = APIRouter(tags=["Inventory - Suppliers"])


@router.get("/inventory/suppliers")
async def list_suppliers(db: DbSession, current_user: CurrentUser, page_params: PageQuery):
    items = await service.list_suppliers(db, current_user.tenant_id, page_params.offset, page_params.limit)
    total = await service.count_suppliers(db, current_user.tenant_id)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Suppliers retrieved successfully")


@router.post("/inventory/suppliers")
async def create_supplier(data: SupplierCreate, db: DbSession, current_user: CurrentUser):
    obj = await service.create_supplier(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Supplier created successfully", status_code=201)


@router.get("/inventory/suppliers/{id}")
async def get_supplier(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    obj = await service.get_supplier(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Supplier retrieved successfully")


@router.patch("/inventory/suppliers/{id}")
async def update_supplier(id: uuid.UUID, data: SupplierUpdate, db: DbSession, current_user: CurrentUser):
    obj = await service.update_supplier(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Supplier updated successfully")


@router.delete("/inventory/suppliers/{id}")
async def delete_supplier(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    await service.delete_supplier(db, current_user.tenant_id, id)
    return success_response(message="Supplier deleted successfully")
