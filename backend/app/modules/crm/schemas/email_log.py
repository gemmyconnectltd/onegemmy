import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class EmailLogCreate(BaseModel):
    recipient: str
    subject: str
    body: str | None = None
    status: str = "Sent"
    sent_at: datetime | None = None
    campaign_id: uuid.UUID | None = None


class EmailLogUpdate(BaseModel):
    status: str | None = None
    sent_at: datetime | None = None
    campaign_id: uuid.UUID | None = None


class EmailLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    campaign_id: uuid.UUID | None
    recipient: str
    subject: str
    body: str | None
    status: str
    sent_at: datetime | None
    created_at: datetime | None = None
    updated_at: datetime | None = None
