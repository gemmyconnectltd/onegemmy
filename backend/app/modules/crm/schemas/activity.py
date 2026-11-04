import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ActivityKind = Literal["call", "meeting", "email", "note", "task"]
ActivityStatus = Literal["open", "done", "cancelled"]


class ActivityCreate(BaseModel):
    customer_id: uuid.UUID | None = None
    deal_id: uuid.UUID | None = None
    kind: ActivityKind
    subject: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    status: ActivityStatus = "open"
    due_at: datetime | None = None


class ActivityUpdate(BaseModel):
    customer_id: uuid.UUID | None = None
    deal_id: uuid.UUID | None = None
    kind: ActivityKind | None = None
    subject: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    status: ActivityStatus | None = None
    due_at: datetime | None = None


class ActivityContact(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str


class ActivityOpportunity(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str


class ActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    customer_id: uuid.UUID | None
    deal_id: uuid.UUID | None
    created_by_id: uuid.UUID | None
    kind: str
    subject: str
    description: str | None
    status: str
    due_at: datetime | None
    completed_at: datetime | None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    customer: ActivityContact | None = None
    deal: ActivityOpportunity | None = None
