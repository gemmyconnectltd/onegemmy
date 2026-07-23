from pydantic import BaseModel
from typing import Optional, List
from app.schemas.common import TimestampMixin
from app.schemas.role import RoleResponse
from app.schemas.company import CompanyResponse
from app.schemas.shop import ShopResponse


class PermissionResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    module: str

    class Config:
        from_attributes = True


class UserResponse(TimestampMixin):
    id: int
    email: str
    name: str
    platform_role: str
    role_id: Optional[int] = None
    company_id: Optional[int] = None
    shop_id: Optional[int] = None
    is_active: bool = True

    class Config:
        from_attributes = True


class UserWithRole(UserResponse):
    role: Optional[RoleResponse] = None
    company: Optional[CompanyResponse] = None
    shop: Optional[ShopResponse] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    platform_role: Optional[str] = None
    role_id: Optional[int] = None
    company_id: Optional[int] = None
    shop_id: Optional[int] = None
    is_active: Optional[bool] = None


class UserInvite(BaseModel):
    email: str
    name: str
    platform_role: Optional[str] = "user"
    role_id: Optional[int] = None
    company_id: Optional[int] = None
    shop_id: Optional[int] = None
