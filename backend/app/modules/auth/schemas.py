import uuid

from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    tenant_name: str
    tenant_slug: str
    email: EmailStr
    password: str
    full_name: str


class LoginRequest(BaseModel):
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
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
