import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class CampaignCreate(BaseModel):
    name: str
    type: str = "Email"
    status: str = "Draft"
    start_date: date | None = None
    target_count: int = 0
    sent_count: int = 0
    opened_count: int = 0


class CampaignUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    status: str | None = None
    start_date: date | None = None
    target_count: int | None = None
    sent_count: int | None = None
    opened_count: int | None = None


class CampaignRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    type: str
    status: str
    start_date: date | None
    target_count: int
    sent_count: int
    opened_count: int
    created_at: datetime | None = None
    updated_at: datetime | None = None
