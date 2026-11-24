import uuid
from decimal import Decimal

from pydantic import BaseModel, Field


class BranchSettingIn(BaseModel):
    """How one branch sells a product. ``price`` None = the product's default price. Prices are checked by the service
    (above zero, not below cost) so the message can name the branch and the amounts."""
    branch_id: uuid.UUID
    is_available: bool = True
    price: Decimal | None = Field(default=None, max_digits=12, decimal_places=2)
    keep_price: bool = False  # change only whether it is sold there; its branch price stays as it is


class ProductBranchesUpdate(BaseModel):
    branches: list[BranchSettingIn] = Field(min_length=1, max_length=100)


class BranchPriceChange(BranchSettingIn):
    product_id: uuid.UUID


class BranchPricesUpdate(BaseModel):
    changes: list[BranchPriceChange] = Field(min_length=1, max_length=500)


class BranchVisibilityUpdate(BaseModel):
    """Show or hide several products in one branch (the products list's bulk action)."""
    product_ids: list[uuid.UUID] = Field(min_length=1, max_length=500)
    branch_id: uuid.UUID
    visible: bool


class BranchPricingSwitch(BaseModel):
    enabled: bool
