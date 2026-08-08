import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.crm.models.campaign import Campaign
from app.modules.crm.repository import CampaignRepository
from app.modules.crm.schemas import CampaignCreate, CampaignRead, CampaignUpdate


async def list_campaigns(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 50) -> list[CampaignRead]:
    items = await CampaignRepository(db).list_for_tenant(tenant_id, offset, limit)
    return [CampaignRead.model_validate(i) for i in items]


async def count_campaigns(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await CampaignRepository(db).count_for_tenant(tenant_id)


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
    for field, value in data.model_dump(exclude_unset=True).items():
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
