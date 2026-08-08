import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.crm.models.email_log import EmailLog
from app.modules.crm.repository import EmailLogRepository
from app.modules.crm.schemas import EmailLogCreate, EmailLogRead, EmailLogUpdate


async def list_emails(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 50) -> list[EmailLogRead]:
    items = await EmailLogRepository(db).list_for_tenant(tenant_id, offset, limit)
    return [EmailLogRead.model_validate(i) for i in items]


async def count_emails(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await EmailLogRepository(db).count_for_tenant(tenant_id)


async def get_email(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> EmailLogRead:
    obj = await EmailLogRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Email not found")
    return EmailLogRead.model_validate(obj)


async def create_email(db: AsyncSession, tenant_id: uuid.UUID, data: EmailLogCreate) -> EmailLogRead:
    obj = EmailLog(tenant_id=tenant_id, **data.model_dump())
    obj = await EmailLogRepository(db).save(obj)
    await db.commit()
    obj = await EmailLogRepository(db).get_by_id_for_tenant(tenant_id, obj.id)
    return EmailLogRead.model_validate(obj)


async def update_email(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: EmailLogUpdate) -> EmailLogRead:
    obj = await EmailLogRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Email not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await EmailLogRepository(db).save(obj)
    await db.commit()
    obj = await EmailLogRepository(db).get_by_id_for_tenant(tenant_id, id)
    return EmailLogRead.model_validate(obj)


async def delete_email(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await EmailLogRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Email not found")
    await EmailLogRepository(db).delete(obj)
    await db.commit()
