import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.crm.models.campaign import Campaign
from app.modules.crm.repository import CampaignRepository
from app.modules.crm.schemas import CampaignCreate, CampaignRead, CampaignUpdate


async def list_campaigns(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    offset: int = 0,
    limit: int = 50,
    search: str | None = None,
    status: str | None = None,
) -> list[CampaignRead]:
    items = await CampaignRepository(db).list_for_tenant(
        tenant_id, offset, limit, search, status
    )
    return [CampaignRead.model_validate(i) for i in items]


async def count_campaigns(
    db: AsyncSession, tenant_id: uuid.UUID, search: str | None = None, status: str | None = None
) -> int:
    return await CampaignRepository(db).count_for_tenant(tenant_id, search, status)


async def get_campaign(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> CampaignRead:
    obj = await CampaignRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Campaign not found")
    return CampaignRead.model_validate(obj)


async def create_campaign(db: AsyncSession, tenant_id: uuid.UUID, data: CampaignCreate) -> CampaignRead:
    obj = Campaign(tenant_id=tenant_id, **data.model_dump())
    obj = await CampaignRepository(db).save(obj)
    await db.commit()
    obj = await CampaignRepository(db).get_by_id_for_tenant(tenant_id, obj.id)
    return CampaignRead.model_validate(obj)


async def update_campaign(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: CampaignUpdate) -> CampaignRead:
    obj = await CampaignRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Campaign not found")
    changes = data.model_dump(exclude_unset=True)
    if any(changes.get(field) is None for field in ("name", "type", "status", "target_count", "sent_count", "opened_count") if field in changes):
        raise ValidationError("Campaign name, channel, status and counts cannot be empty.")
    for field, value in changes.items():
        setattr(obj, field, value)
    await CampaignRepository(db).save(obj)
    await db.commit()
    obj = await CampaignRepository(db).get_by_id_for_tenant(tenant_id, id)
    return CampaignRead.model_validate(obj)


async def delete_campaign(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await CampaignRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Campaign not found")
    await CampaignRepository(db).delete(obj)
    await db.commit()
