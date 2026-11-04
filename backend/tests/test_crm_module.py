import uuid

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.crm.models.campaign import Campaign
from app.modules.crm.models.email_log import EmailLog
from app.modules.crm.schemas.activity import ActivityCreate
from app.modules.crm.schemas.email_log import EmailLogCreate, EmailLogUpdate
from app.modules.crm.service import activity as activity_service
from app.modules.crm.service import campaign as campaign_service
from app.modules.crm.service import email_log as email_service
from app.modules.tenants.models import Tenant


def test_email_log_rejects_invalid_recipient_addresses():
    with pytest.raises(PydanticValidationError):
        EmailLogCreate(recipient="not-an-email", subject="Hello")


async def test_activity_requires_a_contact_or_opportunity():
    with pytest.raises(ValidationError, match="Link an activity"):
        await activity_service.create_activity(
            None,
            uuid.uuid4(),
            uuid.uuid4(),
            "CRM test",
            ActivityCreate(kind="call", subject="Follow up"),
        )


@pytest.mark.db
async def test_email_campaign_links_are_tenant_scoped_and_history_survives_campaign_delete(db):
    suffix = uuid.uuid4().hex[:8]
    tenant = Tenant(name=f"CRM {suffix}", slug=f"crm-{suffix}", is_active=True)
    other_tenant = Tenant(name=f"Other {suffix}", slug=f"other-{suffix}", is_active=True)
    db.add_all([tenant, other_tenant])
    await db.flush()

    foreign_campaign = Campaign(tenant_id=other_tenant.id, name="Foreign campaign")
    campaign = Campaign(tenant_id=tenant.id, name="Local campaign")
    replacement = Campaign(tenant_id=tenant.id, name="Replacement campaign")
    db.add_all([foreign_campaign, campaign, replacement])
    await db.flush()

    with pytest.raises(NotFoundError, match="Campaign not found"):
        await email_service.create_email(
            db,
            tenant.id,
            EmailLogCreate(
                recipient="person@example.com",
                subject="Hello",
                campaign_id=foreign_campaign.id,
            ),
        )

    logged = await email_service.create_email(
        db,
        tenant.id,
        EmailLogCreate(
            recipient="person@example.com",
            subject="Hello",
            campaign_id=campaign.id,
        ),
    )
    assert logged.campaign and logged.campaign.name == "Local campaign"

    updated = await email_service.update_email(
        db, tenant.id, logged.id, EmailLogUpdate(campaign_id=replacement.id)
    )
    assert updated.campaign and updated.campaign.name == "Replacement campaign"

    await campaign_service.delete_campaign(db, tenant.id, replacement.id)
    stored = await db.get(EmailLog, logged.id)
    await db.refresh(stored)
    assert stored.campaign_id is None
    assert stored.subject == "Hello"
