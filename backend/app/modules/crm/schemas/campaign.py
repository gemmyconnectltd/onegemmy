import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class CampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: str = Field(default="Email", max_length=20)
    status: str = Field(default="Draft", max_length=20)
    start_date: date | None = None
    target_count: int = Field(default=0, ge=0)
    sent_count: int = Field(default=0, ge=0)
    opened_count: int = Field(default=0, ge=0)


class CampaignUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    type: str | None = Field(default=None, max_length=20)
    status: str | None = Field(default=None, max_length=20)
    start_date: date | None = None
    target_count: int | None = Field(default=None, ge=0)
    sent_count: int | None = Field(default=None, ge=0)
    opened_count: int | None = Field(default=None, ge=0)


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
