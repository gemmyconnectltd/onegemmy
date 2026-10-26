import uuid

from fastapi import APIRouter

from app.core.deps import ActiveBranchId, CurrentUser, DbSession
from app.core.exceptions import ForbiddenError, ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.sales import service
from app.modules.sales.schemas import CustomerBulkCreate, CustomerCreate, CustomerUpdate
from app.modules.sales.service import customer_profile

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
    if data.credit_daily_limit is not None and not current_user.is_superuser and "credit:approve" not in current_user.permissions_names:
        raise ForbiddenError("Permission required: credit:approve")
    obj = await service.create_customer(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Customer created successfully", status_code=201)


@router.post("/sales/customers/bulk")
async def bulk_create_customers(data: CustomerBulkCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    if any(item.credit_daily_limit is not None for item in data.items) and not current_user.is_superuser and "credit:approve" not in current_user.permissions_names:
        raise ForbiddenError("Permission required: credit:approve")
    result = await service.bulk_create_customers(db, current_user.tenant_id, data)
    return success_response(data=result.model_dump(), message=f"{result.created} customers imported", status_code=201)


@router.get("/sales/customers/{id}/profile")
async def customer_profile_view(id: uuid.UUID, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    return success_response(data=await customer_profile.profile(db, current_user, branch, id), message="Customer profile retrieved successfully")


@router.get("/sales/customers/{id}/records/{section}")
async def customer_records(id: uuid.UUID, section: str, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId, page_params: PageQuery):
    return success_response(data=await customer_profile.section(db, current_user, branch, id, section, page_params.page, min(page_params.page_size, 50)),
                            message="Customer records retrieved successfully")


@router.get("/sales/customers/{id}")
async def get_customer(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_customer(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Customer retrieved successfully")


@router.patch("/sales/customers/{id}")
async def update_customer(id: uuid.UUID, data: CustomerUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    if "credit_daily_limit" in data.model_fields_set and not current_user.is_superuser and "credit:approve" not in current_user.permissions_names:
        raise ForbiddenError("Permission required: credit:approve")
    obj = await service.update_customer(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Customer updated successfully")


@router.delete("/sales/customers/{id}")
async def delete_customer(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_customer(db, current_user.tenant_id, id)
    return success_response(message="Customer deleted successfully")
