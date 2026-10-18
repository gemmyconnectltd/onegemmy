"""Atomic business onboarding, shared by platform administration entrypoints."""
import secrets

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email import send_invite_email
from app.core.exceptions import ConflictError
from app.core.security import hash_password
from app.modules.audit.service import record_audit
from app.modules.tenants import service
from app.modules.tenants.models import User
from app.modules.tenants.repository import UserRepository
from app.modules.tenants.schemas import TenantCreate, TenantRead


async def onboard_business(
    db: AsyncSession, data: TenantCreate, owner_name: str, owner_email: str, admin: User,
) -> TenantRead:
    if await UserRepository(db).get_by_email_global(owner_email):
        raise ConflictError("Owner email already belongs to an account")
    tenant = await service.create_tenant(db, data, commit=False)
    role_id = await service.resolve_role_id(db, tenant.id, "owner")
    password = secrets.token_urlsafe(24)
    owner = User(tenant_id=tenant.id, email=owner_email, full_name=owner_name,
                 role="owner", role_id=role_id, hashed_password=hash_password(password),
                 is_active=True, is_superuser=True)
    db.add(owner)
    await db.flush()
    await record_audit(
        db, tenant_id=None, actor_user_id=admin.id, actor_name=admin.full_name or admin.email,
        action="tenant.create", entity_type="tenant", entity_id=str(tenant.id),
        summary=f"Tenant '{tenant.name}' created with owner",
    )
    await db.commit()
    await send_invite_email(to=owner.email, full_name=owner.full_name,
                            tenant_name=tenant.name, temp_password=password)
    return tenant
