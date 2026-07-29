import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.response import paginated_response, success_response
from app.modules.shops import service
from app.modules.shops.schemas import ShopCreate, ShopRead, ShopUpdate

router = APIRouter(prefix="/shops", tags=["shops"])


@router.get("")
async def list_shops(db: DbSession, current_user: CurrentUser):
    from app.core.pagination import PageParams
    params = PageParams()
    shops = await service.list_for_tenant(db, current_user.tenant_id, params.offset, params.limit)
    total = await service.count_for_tenant(db, current_user.tenant_id)
    return paginated_response(
        items=[ShopRead.model_validate(s).model_dump() for s in shops],
        total=total,
        page=params.page,
        page_size=params.page_size,
        message="Shops retrieved successfully",
    )


@router.post("")
async def create_shop(data: ShopCreate, db: DbSession, current_user: CurrentUser):
    shop = await service.create(db, current_user.tenant_id, data)
    return success_response(
        data=ShopRead.model_validate(shop).model_dump(),
        message="Shop created successfully",
        status_code=201,
    )


@router.get("/{shop_id}")
async def get_shop(shop_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    shop = await service.get_by_id(db, current_user.tenant_id, shop_id)
    return success_response(
        data=ShopRead.model_validate(shop).model_dump(),
        message="Shop retrieved successfully",
    )


@router.patch("/{shop_id}")
async def update_shop(
    shop_id: uuid.UUID, data: ShopUpdate, db: DbSession, current_user: CurrentUser
):
    shop = await service.get_by_id(db, current_user.tenant_id, shop_id)
    shop = await service.update(db, shop, data)
    return success_response(
        data=ShopRead.model_validate(shop).model_dump(),
        message="Shop updated successfully",
    )


@router.delete("/{shop_id}")
async def delete_shop(shop_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    shop = await service.get_by_id(db, current_user.tenant_id, shop_id)
    await service.delete(db, shop)
    return success_response(message="Shop deleted successfully")
