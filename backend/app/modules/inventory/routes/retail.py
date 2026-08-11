import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.response import success_response
from app.modules.inventory import service
from app.modules.inventory.schemas import GenerateVariantsRequest

router = APIRouter(tags=["Inventory - Retail"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant. Log in as a tenant user.")


@router.post("/inventory/products/{id}/variants/generate")
async def generate_variants(id: uuid.UUID, data: GenerateVariantsRequest, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    result = await service.generate_variants(db, current_user.tenant_id, id, data)
    return success_response(
        data=result.model_dump(),
        message=f"{result.created} variants created, {result.skipped} skipped",
        status_code=201,
    )


@router.get("/inventory/reports/size-sellout")
async def size_sellout(db: DbSession, current_user: CurrentUser,
                       product_id: uuid.UUID | None = None, attribute_key: str = "Size"):
    _require_tenant(current_user.tenant_id)
    report = await service.size_sellout(db, current_user.tenant_id, product_id, attribute_key)
    return success_response(data=report.model_dump(), message="Size sellout report retrieved successfully")


@router.get("/inventory/markdowns")
async def active_markdowns(db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    report = await service.active_markdowns(db, current_user.tenant_id)
    return success_response(data=report.model_dump(), message="Active markdowns retrieved successfully")
