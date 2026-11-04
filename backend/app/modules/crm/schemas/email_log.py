import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class EmailLogCreate(BaseModel):
    recipient: EmailStr = Field(max_length=255)
    subject: str = Field(min_length=1, max_length=255)
    body: str | None = Field(default=None, max_length=10000)
    status: str = Field(default="Draft", max_length=20)
    sent_at: datetime | None = None
    campaign_id: uuid.UUID | None = None


class EmailLogUpdate(BaseModel):
    recipient: EmailStr | None = Field(default=None, max_length=255)
    subject: str | None = Field(default=None, min_length=1, max_length=255)
    body: str | None = Field(default=None, max_length=10000)
    status: str | None = Field(default=None, max_length=20)
    sent_at: datetime | None = None
    campaign_id: uuid.UUID | None = None


class EmailCampaign(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str


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
    campaign: EmailCampaign | None = None
