import uuid

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ForbiddenError, ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.sales import service as sales_service
from app.modules.sales.schemas import CustomerCreateStrict, CustomerUpdate

router = APIRouter(tags=["CRM - Contacts"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/crm/contacts")
async def list_contacts(
    db: DbSession,
    current_user: CurrentUser,
    page_params: PageQuery,
    search: str | None = Query(None, max_length=100),
    customer_type: str | None = Query(None, pattern="^(individual|business)$"),
):
    _require_tenant(current_user.tenant_id)
    items = await sales_service.list_customers(
        db,
        current_user.tenant_id,
        page_params.offset,
        page_params.limit,
        search,
        customer_type,
    )
    total = await sales_service.count_customers(
        db, current_user.tenant_id, search, customer_type
    )
    return paginated_response(
        items=[item.model_dump() for item in items],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
        message="Contacts retrieved successfully",
    )


@router.post("/crm/contacts")
async def create_contact(data: CustomerCreateStrict, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    if (
        data.credit_daily_limit is not None
        and not current_user.is_superuser
        and "credit:approve" not in current_user.permissions_names
    ):
        raise ForbiddenError("Permission required: credit:approve")
    obj = await sales_service.create_customer(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Contact created", status_code=201)


@router.get("/crm/contacts/{contact_id}")
async def get_contact(contact_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await sales_service.get_customer(db, current_user.tenant_id, contact_id)
    return success_response(data=obj.model_dump(), message="Contact retrieved")


@router.patch("/crm/contacts/{contact_id}")
async def update_contact(
    contact_id: uuid.UUID, data: CustomerUpdate, db: DbSession, current_user: CurrentUser
):
    _require_tenant(current_user.tenant_id)
    if (
        "credit_daily_limit" in data.model_fields_set
        and not current_user.is_superuser
        and "credit:approve" not in current_user.permissions_names
    ):
        raise ForbiddenError("Permission required: credit:approve")
    obj = await sales_service.update_customer(db, current_user.tenant_id, contact_id, data)
    return success_response(data=obj.model_dump(), message="Contact updated")


@router.delete("/crm/contacts/{contact_id}")
async def delete_contact(
    contact_id: uuid.UUID, db: DbSession, current_user: CurrentUser
):
    _require_tenant(current_user.tenant_id)
    await sales_service.delete_customer(db, current_user.tenant_id, contact_id)
    return success_response(message="Contact deleted")
