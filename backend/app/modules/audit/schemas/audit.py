import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID | None
    actor_user_id: uuid.UUID | None
    actor_name: str | None
    action: str
    entity_type: str
    entity_id: str | None
    summary: str
    changes: dict | None
    ip_address: str | None
    created_at: datetime | None
