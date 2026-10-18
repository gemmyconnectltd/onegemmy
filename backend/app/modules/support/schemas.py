import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class AttachmentRead(BaseModel):
    id: str
    name: str
    mime: str | None = None
    size: int | None = None
    url: str  # authenticated download path, never a raw filesystem path


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    conversation_id: uuid.UUID
    direction: str
    is_internal_note: bool
    sender_name: str | None
    sender_user_id: uuid.UUID | None
    body: str
    attachments: list[AttachmentRead] = []
    delivery_status: str | None
    delivery_error: str | None
    created_at: datetime


class ConversationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    channel: str
    subject: str | None
    customer_name: str | None
    customer_email: str | None
    customer_phone: str | None
    tenant_id: uuid.UUID | None
    tenant_name: str | None = None
    status: str
    priority: str
    assigned_to: uuid.UUID | None
    assigned_name: str | None = None
    unread_count: int
    last_message_at: datetime | None
    last_message_preview: str | None
    resolved_at: datetime | None
    created_at: datetime
    ticket_id: uuid.UUID | None = None
    ticket_reference: str | None = None


class TicketRead(BaseModel):
    id: uuid.UUID
    reference: str
    tenant_id: uuid.UUID | None
    tenant_name: str | None = None
    conversation_id: uuid.UUID
    requester_user_id: uuid.UUID | None
    requester_name: str | None = None
    subject: str
    status: str
    priority: str
    assigned_to: uuid.UUID | None
    assigned_name: str | None = None
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ReplyIn(BaseModel):
    body: str = Field(default="", max_length=10000)
    attachment_ids: list[str] = Field(default_factory=list, max_length=5)


class NoteIn(BaseModel):
    body: str = Field(min_length=1, max_length=10000)


class AssignIn(BaseModel):
    user_id: uuid.UUID | None = None


class StatusIn(BaseModel):
    status: str


class PriorityIn(BaseModel):
    priority: str


class TicketCreateIn(BaseModel):
    subject: str = Field(min_length=3, max_length=500)
    description: str = Field(min_length=1, max_length=10000)
    priority: str = "normal"
    tenant_id: uuid.UUID | None = None  # staff only; tenants always use their own
    customer_email: EmailStr | None = None
    customer_name: str | None = Field(default=None, max_length=255)


class TicketUpdateIn(BaseModel):
    subject: str | None = Field(default=None, min_length=3, max_length=500)
    status: str | None = None
    priority: str | None = None
    assigned_to: uuid.UUID | None = None
    unassign: bool = False


class StaffRead(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    last_login: datetime | None = None
    open_conversations: int = 0
    open_tickets: int = 0


class StaffCreateIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    role: str


class StaffUpdateIn(BaseModel):
    role: str | None = None
    is_active: bool | None = None


class BusinessHoursDay(BaseModel):
    open: str = "08:00"  # HH:MM
    close: str = "17:00"


class SupportSettingsIO(BaseModel):
    timezone: str = "Africa/Kigali"
    # weekday ("mon".."sun") -> hours, or null when closed that day
    hours: dict[str, BusinessHoursDay | None] = Field(default_factory=dict)
    auto_ack_enabled: bool = False
    auto_ack_text: str = Field(default="Thanks for contacting Pesaa support. We've received your message and will reply shortly.", max_length=1000)
    after_hours_text: str = Field(default="Thanks for contacting Pesaa support. We're outside business hours right now and will reply on the next working day.", max_length=1000)
    retention_days: int | None = Field(default=None, ge=30, le=3650)  # None = keep forever
