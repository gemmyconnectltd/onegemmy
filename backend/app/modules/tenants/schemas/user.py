import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    role: str = "member"
    role_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID | None = None
    tenant_name: str | None = None
    email: EmailStr
    full_name: str
    phone: str | None = None
    role: str
    role_id: uuid.UUID | None
    branch_id: uuid.UUID | None
    department_id: uuid.UUID | None
    is_active: bool
    is_superuser: bool
    last_login: datetime | None = None
    permissions: list[str] = []
    created_at: datetime | None = None
    updated_at: datetime | None = None


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    role: str | None = None
    role_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    is_active: bool | None = None


class MyProfileUpdate(BaseModel):
    """Self-service profile edits. Deliberately narrower than UserUpdate —
    email, role, status and org assignment are administrator decisions, so
    they are not reachable here even if a client sends them."""

    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=50)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class AdminResetPasswordRequest(BaseModel):
    """An administrator resetting someone else's password. The new value is
    always generated server-side and emailed to the user — an admin-supplied
    password is never honoured, so it cannot be read back over the admin's
    shoulder or reused elsewhere."""

    send_email: bool = True


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
