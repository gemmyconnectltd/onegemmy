import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.audit.service import record_audit
from app.modules.crm.models.activity import Activity
from app.modules.crm.repository.activity import ActivityRepository
from app.modules.crm.schemas.activity import ActivityCreate, ActivityRead, ActivityUpdate
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.deal import Deal


async def _check_links(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    customer_id: uuid.UUID | None,
    deal_id: uuid.UUID | None,
) -> None:
    if customer_id and (
        await db.execute(
            select(Customer.id).where(Customer.id == customer_id, Customer.tenant_id == tenant_id)
        )
    ).scalar_one_or_none() is None:
        raise NotFoundError("Contact not found")
    if deal_id and (
        await db.execute(select(Deal.id).where(Deal.id == deal_id, Deal.tenant_id == tenant_id))
    ).scalar_one_or_none() is None:
        raise NotFoundError("Opportunity not found")
    if not customer_id and not deal_id:
        raise ValidationError("Link an activity to a contact or an opportunity.")


async def list_activities(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    offset: int = 0,
    limit: int = 50,
    customer_id: uuid.UUID | None = None,
    deal_id: uuid.UUID | None = None,
    status: str | None = None,
    search: str | None = None,
) -> list[ActivityRead]:
    items = await ActivityRepository(db).list_for_tenant(
        tenant_id, offset, limit, customer_id, deal_id, status, search
    )
    return [ActivityRead.model_validate(item) for item in items]


async def count_activities(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    customer_id: uuid.UUID | None = None,
    deal_id: uuid.UUID | None = None,
    status: str | None = None,
    search: str | None = None,
) -> int:
    return await ActivityRepository(db).count_for_tenant(
        tenant_id, customer_id, deal_id, status, search
    )


async def create_activity(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    actor_id: uuid.UUID,
    actor_name: str,
    data: ActivityCreate,
) -> ActivityRead:
    await _check_links(db, tenant_id, data.customer_id, data.deal_id)
    activity = Activity(
        tenant_id=tenant_id,
        created_by_id=actor_id,
        completed_at=datetime.now(UTC) if data.status == "done" else None,
        **data.model_dump(),
    )
    activity = await ActivityRepository(db).save(activity)
    await record_audit(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor_id,
        actor_name=actor_name,
        action="crm.activity.create",
        entity_type="crm_activity",
        entity_id=str(activity.id),
        summary="Created a CRM activity",
        changes={"kind": activity.kind, "status": activity.status},
    )
    await db.commit()
    activity = await ActivityRepository(db).get_by_id_for_tenant(tenant_id, activity.id)
    return ActivityRead.model_validate(activity)


async def update_activity(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    activity_id: uuid.UUID,
    actor_id: uuid.UUID,
    actor_name: str,
    data: ActivityUpdate,
) -> ActivityRead:
    repo = ActivityRepository(db)
    activity = await repo.get_by_id_for_tenant(tenant_id, activity_id)
    if activity is None:
        raise NotFoundError("Activity not found")
    changes = data.model_dump(exclude_unset=True)
    if any(changes.get(field) is None for field in ("kind", "subject", "status") if field in changes):
        raise ValidationError("Activity type, subject and status cannot be empty.")
    customer_id = changes.get("customer_id", activity.customer_id)
    deal_id = changes.get("deal_id", activity.deal_id)
    await _check_links(db, tenant_id, customer_id, deal_id)
    for field, value in changes.items():
        setattr(activity, field, value)
    if "status" in changes:
        activity.completed_at = datetime.now(UTC) if activity.status == "done" else None
    await repo.save(activity)
    await record_audit(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor_id,
        actor_name=actor_name,
        action="crm.activity.update",
        entity_type="crm_activity",
        entity_id=str(activity.id),
        summary="Updated a CRM activity",
        changes={"fields": sorted(changes), "status": activity.status},
    )
    await db.commit()
    activity = await repo.get_by_id_for_tenant(tenant_id, activity_id)
    return ActivityRead.model_validate(activity)


async def delete_activity(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    activity_id: uuid.UUID,
    actor_id: uuid.UUID,
    actor_name: str,
) -> None:
    repo = ActivityRepository(db)
    activity = await repo.get_by_id_for_tenant(tenant_id, activity_id)
    if activity is None:
        raise NotFoundError("Activity not found")
    await record_audit(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor_id,
        actor_name=actor_name,
        action="crm.activity.delete",
        entity_type="crm_activity",
        entity_id=str(activity.id),
        summary="Deleted a CRM activity",
        changes={"kind": activity.kind, "status": activity.status},
    )
    await repo.delete(activity)
    await db.commit()
