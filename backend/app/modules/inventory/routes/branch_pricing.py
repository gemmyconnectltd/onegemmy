"""Branch prices and availability. Guards (see service/branch_pricing.py): the switch is the owner's when Pesaa allows it;
everything else needs branch_prices:manage, and people limited to some branches change only those."""
import uuid
from typing import Literal

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.inventory.schemas.branch_pricing import (
    BranchPricesUpdate,
    BranchPricingSwitch,
    BranchVisibilityUpdate,
    ProductBranchesUpdate,
)
from app.modules.inventory.service import branch_pricing

router = APIRouter(tags=["Inventory - Branch prices"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant. Log in as a tenant user.")


@router.get("/inventory/branch-pricing/status")
async def branch_pricing_status(db: DbSession, current_user: CurrentUser):
    """Is it on, may this person switch it (owner, when Pesaa allows) or edit it, and in which branches."""
    _require_tenant(current_user.tenant_id)
    return success_response(data=await branch_pricing.status(db, current_user))


@router.put("/inventory/branch-pricing/status")
async def switch_branch_pricing(data: BranchPricingSwitch, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    result = await branch_pricing.set_enabled(db, current_user, data.enabled)
    return success_response(data=result, message=f"Branch prices switched {'on' if data.enabled else 'off'}")


@router.get("/inventory/branch-prices")
async def list_branch_prices(db: DbSession, current_user: CurrentUser, page: PageQuery, search: str | None = None,
                             show: Literal["all", "differences", "hidden"] = "all", category_id: uuid.UUID | None = None):
    _require_tenant(current_user.tenant_id)
    data = await branch_pricing.price_list(db, current_user, page.offset, page.limit, search, show, category_id)
    return paginated_response(items=data["items"], total=data["total"], page=page.page, page_size=page.page_size,
                              message="Branch prices retrieved",
                              summary={**data["summary"], "branches": data["branches"], "currency": data["currency"]})


@router.put("/inventory/branch-prices")
async def update_branch_prices(data: BranchPricesUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    changed = await branch_pricing.bulk_set(db, current_user, data.changes)
    return success_response(data={"changed": changed}, message=f"{changed} branch prices updated")


@router.put("/inventory/branch-prices/visibility")
async def update_branch_visibility(data: BranchVisibilityUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    changed = await branch_pricing.set_visibility(db, current_user, data.product_ids, data.branch_id, data.visible)
    return success_response(data={"changed": changed}, message=f"{changed} products {'shown' if data.visible else 'hidden'}")


@router.get("/inventory/products/{id}/branches")
async def get_product_branches(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    return success_response(data=await branch_pricing.product_branches(db, current_user, id))


@router.put("/inventory/products/{id}/branches")
async def update_product_branches(id: uuid.UUID, data: ProductBranchesUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    result = await branch_pricing.set_product_branches(db, current_user, id, data.branches)
    return success_response(data=result, message="Branch prices saved")
