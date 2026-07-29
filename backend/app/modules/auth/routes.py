from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.response import success_response
from app.modules.auth import service
from app.modules.auth.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
)
from app.modules.tenants.schemas import ChangePasswordRequest

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
async def register(data: RegisterRequest, db: DbSession):
    result = await service.register(db, data)
    return success_response(
        data=result.model_dump(),
        message="Registration successful",
        status_code=201,
    )


@router.post("/login")
async def login(data: LoginRequest, db: DbSession):
    result = await service.login(db, data)
    return success_response(
        data=result.model_dump(),
        message="Login successful",
    )


@router.post("/refresh")
async def refresh(data: RefreshRequest, db: DbSession):
    result = await service.refresh(db, data.refresh_token)
    return success_response(
        data=result.model_dump(),
        message="Token refreshed successfully",
    )


@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest, db: DbSession):
    result = await service.forgot_password(db, data)
    return success_response(
        data=result,
        message="If the email exists, a password reset link has been sent",
    )


@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest, db: DbSession):
    await service.reset_password(db, data)
    return success_response(message="Password reset successful")


@router.post("/change-password")
async def change_password(data: ChangePasswordRequest, db: DbSession, current_user: CurrentUser):
    await service.change_password(db, current_user, data)
    return success_response(message="Password changed successfully")
