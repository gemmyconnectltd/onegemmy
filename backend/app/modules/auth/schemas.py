import uuid

from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    tenant_name: str
    tenant_slug: str
    email: EmailStr
    full_name: str
    password: str

    # Business information — collected on the register form's second step.
    # All optional, so the endpoint keeps working if the frontend ever
    # trims this step down or a field is left blank.
    business_type: str | None = None
    industry: str | None = None
    business_category: str | None = None
    employee_count: str | None = None
    business_location: str | None = None
    heard_about: str | None = None
    referral_code: str | None = None


class LoginRequest(BaseModel):
    tenant_slug: str | None = None
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
    tenant_id: uuid.UUID | None = None
    tenant_name: str | None = None
    tenant_slug: str | None = None
    permissions: list[str]


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: TokenUserInfo


class RegisterResponse(BaseModel):
    """Self-service signups land inactive until a platform admin approves
    them — see auth.service.register — so no tokens are issued yet."""

    pending_approval: bool = True
    tenant_slug: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
