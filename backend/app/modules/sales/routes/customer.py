import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.sales import service
from app.modules.sales.schemas import CustomerBulkCreate, CustomerCreate, CustomerUpdate

router = APIRouter(tags=["Sales - Customers"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/sales/customers")
async def list_customers(db: DbSession, current_user: CurrentUser, page_params: PageQuery, search: str | None = None, customer_type: str | None = None):
    _require_tenant(current_user.tenant_id)
    items = await service.list_customers(db, current_user.tenant_id, page_params.offset, page_params.limit, search, customer_type)
    total = await service.count_customers(db, current_user.tenant_id, search, customer_type)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Customers retrieved successfully")


@router.post("/sales/customers")
async def create_customer(data: CustomerCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_customer(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Customer created successfully", status_code=201)


@router.post("/sales/customers/bulk")
async def bulk_create_customers(data: CustomerBulkCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    result = await service.bulk_create_customers(db, current_user.tenant_id, data)
    return success_response(data=result.model_dump(), message=f"{result.created} customers imported", status_code=201)


@router.get("/sales/customers/{id}")
async def get_customer(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_customer(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Customer retrieved successfully")


@router.patch("/sales/customers/{id}")
async def update_customer(id: uuid.UUID, data: CustomerUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_customer(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Customer updated successfully")


@router.delete("/sales/customers/{id}")
async def delete_customer(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_customer(db, current_user.tenant_id, id)
    return success_response(message="Customer deleted successfully")
