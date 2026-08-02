import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class ApplicantCreate(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    position: str | None = None
    stage: str = "Applied"
    applied_date: date | None = None


class ApplicantUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    position: str | None = None
    stage: str | None = None


class ApplicantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    email: str | None
    phone: str | None
    position: str | None
    stage: str
    applied_date: date
    created_at: datetime | None = None
    updated_at: datetime | None = None
