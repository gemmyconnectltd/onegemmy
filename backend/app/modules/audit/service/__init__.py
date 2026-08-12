import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.audit.models import AuditLog
from app.modules.audit.repository import AuditLogRepository
from app.modules.audit.schemas import AuditLogRead


async def record_audit(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID | None,
    actor_user_id: uuid.UUID | None,
    actor_name: str | None,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    summary: str,
    changes: dict | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    """Append an immutable audit entry. Does not commit — caller owns the transaction."""
    entry = AuditLog(
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        actor_name=actor_name,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        summary=summary,
        changes=changes,
        ip_address=ip_address,
    )
    db.add(entry)
    await db.flush()
    return entry


async def list_audit_logs(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    offset: int = 0,
    limit: int = 20,
    action: str | None = None,
    entity_type: str | None = None,
) -> list[AuditLogRead]:
    items = await AuditLogRepository(db).list_for_tenant(tenant_id, offset, limit, action, entity_type)
    return [AuditLogRead.model_validate(i) for i in items]


async def count_audit_logs(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    action: str | None = None,
    entity_type: str | None = None,
) -> int:
    return await AuditLogRepository(db).count_for_tenant(tenant_id, action, entity_type)


async def get_audit_log(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> AuditLogRead:
    obj = await AuditLogRepository(db).get_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Audit log entry not found")
    return AuditLogRead.model_validate(obj)


async def list_platform_audit_logs(db: AsyncSession, offset: int = 0, limit: int = 20) -> list[AuditLogRead]:
    items = await AuditLogRepository(db).list_platform(offset, limit)
    return [AuditLogRead.model_validate(i) for i in items]


async def count_platform_audit_logs(db: AsyncSession) -> int:
    return await AuditLogRepository(db).count_platform()
