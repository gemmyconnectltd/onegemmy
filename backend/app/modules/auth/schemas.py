import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class RoleCreate(BaseModel):
    name: str
    description: str | None = None


class RoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class RoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime


class PermissionCreate(BaseModel):
    name: str
    description: str | None = None
    resource: str
    action: str


class PermissionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    resource: str | None = None
    action: str | None = None


class PermissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    resource: str
    action: str
    created_at: datetime
    updated_at: datetime


class RolePermissionAssign(BaseModel):
    permission_ids: list[uuid.UUID]


class RegisterRequest(BaseModel):
    tenant_name: str
    tenant_slug: str
    email: EmailStr
    password: str
    full_name: str


class LoginRequest(BaseModel):
    tenant_slug: str
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenUserInfo(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: str
    role_id: uuid.UUID | None
    is_superuser: bool
    tenant_id: uuid.UUID
    tenant_name: str
    tenant_slug: str
    permissions: list[str]


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: TokenUserInfo


class ForgotPasswordRequest(BaseModel):
    tenant_slug: str
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
