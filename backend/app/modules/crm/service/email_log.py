import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.crm.models.campaign import Campaign
from app.modules.crm.models.email_log import EmailLog
from app.modules.crm.repository import CampaignRepository, EmailLogRepository
from app.modules.crm.schemas import EmailLogCreate, EmailLogRead, EmailLogUpdate


async def _get_campaign(
    db: AsyncSession, tenant_id: uuid.UUID, campaign_id: uuid.UUID | None
) -> Campaign | None:
    if campaign_id is None:
        return None
    campaign = await CampaignRepository(db).get_by_id_for_tenant(tenant_id, campaign_id)
    if campaign is None:
        raise NotFoundError("Campaign not found")
    return campaign


async def list_emails(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    offset: int = 0,
    limit: int = 50,
    search: str | None = None,
    status: str | None = None,
) -> list[EmailLogRead]:
    items = await EmailLogRepository(db).list_for_tenant(
        tenant_id, offset, limit, search, status
    )
    return [EmailLogRead.model_validate(i) for i in items]


async def count_emails(
    db: AsyncSession, tenant_id: uuid.UUID, search: str | None = None, status: str | None = None
) -> int:
    return await EmailLogRepository(db).count_for_tenant(tenant_id, search, status)


async def get_email(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> EmailLogRead:
    obj = await EmailLogRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Email not found")
    return EmailLogRead.model_validate(obj)


async def create_email(db: AsyncSession, tenant_id: uuid.UUID, data: EmailLogCreate) -> EmailLogRead:
    campaign = await _get_campaign(db, tenant_id, data.campaign_id)
    obj = EmailLog(tenant_id=tenant_id, **data.model_dump())
    obj.campaign = campaign
    obj = await EmailLogRepository(db).save(obj)
    await db.commit()
    obj = await EmailLogRepository(db).get_by_id_for_tenant(tenant_id, obj.id)
    return EmailLogRead.model_validate(obj)


async def update_email(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: EmailLogUpdate) -> EmailLogRead:
    obj = await EmailLogRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Email not found")
    changes = data.model_dump(exclude_unset=True)
    if any(changes.get(field) is None for field in ("recipient", "subject", "status") if field in changes):
        raise ValidationError("Email recipient, subject and status cannot be empty.")
    if "campaign_id" in changes:
        obj.campaign = await _get_campaign(db, tenant_id, changes.pop("campaign_id"))
    for field, value in changes.items():
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
