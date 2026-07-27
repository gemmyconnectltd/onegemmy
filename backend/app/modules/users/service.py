import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, UnauthorizedError
from app.core.logging import get_logger
from app.core.security import hash_password, verify_password
from app.modules.users.models import User
from app.modules.users.repository import UserRepository
from app.modules.users.schemas import ChangePasswordRequest, UserCreate, UserUpdate

log = get_logger("users")


async def get_by_id(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID) -> User:
    user = await UserRepository(db).get_by_id_for_tenant(tenant_id, user_id)
    if user is None:
        log.warning("users.get_by_id.not_found", extra={"_extra_fields": {"user_id": str(user_id), "tenant_id": str(tenant_id)}})
        raise NotFoundError("User not found")
    return user


async def get_by_email(db: AsyncSession, tenant_id: uuid.UUID, email: str) -> User | None:
    return await UserRepository(db).get_by_email(tenant_id, email)


async def get_by_email_global(db: AsyncSession, email: str) -> User | None:
    return await UserRepository(db).get_by_email_global(email)


async def list_for_tenant(db: AsyncSession, tenant_id: uuid.UUID, offset: int, limit: int) -> list[User]:
    return await UserRepository(db).list_for_tenant(tenant_id, offset, limit)


async def count_for_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await UserRepository(db).count_for_tenant(tenant_id)


async def create(db: AsyncSession, tenant_id: uuid.UUID, data: UserCreate) -> User:
    log.info("users.create.attempt", extra={"_extra_fields": {"email": data.email, "tenant_id": str(tenant_id)}})

    existing = await get_by_email(db, tenant_id, data.email)
    if existing:
        log.warning("users.create.conflict", extra={"_extra_fields": {"email": data.email}})
        raise ConflictError("User with this email already exists in this tenant")

    user = User(
        tenant_id=tenant_id,
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        role=data.role,
        role_id=data.role_id,
    )
    user = await UserRepository(db).save(user)
    log.info("users.create.success", extra={"_extra_fields": {"user_id": str(user.id)}})
    return user


async def update_user(db: AsyncSession, user: User, data: UserUpdate) -> User:
    fields = list(data.model_dump(exclude_unset=True).keys())
    log.info("users.update.attempt", extra={"_extra_fields": {"user_id": str(user.id), "fields": fields}})

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    user = await UserRepository(db).save(user)
    log.info("users.update.success", extra={"_extra_fields": {"user_id": str(user.id)}})
    return user


async def delete(db: AsyncSession, user: User) -> None:
    log.info("users.delete.attempt", extra={"_extra_fields": {"user_id": str(user.id), "email": user.email}})
    await UserRepository(db).delete(user)
    log.info("users.delete.success", extra={"_extra_fields": {"user_id": str(user.id)}})


async def change_password(db: AsyncSession, user: User, data: ChangePasswordRequest) -> None:
    log.info("users.change_password.attempt", extra={"_extra_fields": {"user_id": str(user.id)}})
    if not verify_password(data.current_password, user.hashed_password):
        log.warning("users.change_password.wrong_password", extra={"_extra_fields": {"user_id": str(user.id)}})
        raise UnauthorizedError("Current password is incorrect")
    user.hashed_password = hash_password(data.new_password)
    await UserRepository(db).save(user)
    log.info("users.change_password.success", extra={"_extra_fields": {"user_id": str(user.id)}})


async def reset_password(db: AsyncSession, user: User, new_password: str) -> None:
    log.info("users.reset_password.attempt", extra={"_extra_fields": {"user_id": str(user.id)}})
    user.hashed_password = hash_password(new_password)
    await UserRepository(db).save(user)
    log.info("users.reset_password.success", extra={"_extra_fields": {"user_id": str(user.id)}})
