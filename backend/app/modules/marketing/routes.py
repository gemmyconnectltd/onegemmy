"""Marketing Hub API. Every route under /admin/marketing requires a platform superadmin (checked on the router, so a route
can't forget it). Tracking routes under /global/m are public by design: each is authorised by a signed token."""
import asyncio
import io
import smtplib
import uuid
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, Query, Request, Response, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as env
from app.core.deps import CurrentUser, DbSession, get_current_active_superuser
from app.core.email import EmailDeliveryError, _resolve_smtp_credentials, send_email_message
from app.core.exceptions import NotFoundError, ValidationError
from app.core.pagination import PageQuery
from app.core.rate_limit import rate_limit
from app.core.response import paginated_response, success_response
from app.modules.admin.analytics import PeriodDep
from app.modules.audit.models import AuditLog
from app.modules.audit.service import record_audit
from app.modules.marketing import (
    analytics,
    automations,
    campaigns,
    contacts,
    engine,
    templates,
    tracking,
)
from app.modules.marketing import settings as mkt_settings
from app.modules.marketing.models import (
    MarketingAutomation,
    MarketingCampaign,
    MarketingContact,
    MarketingSegment,
    MarketingSend,
    MarketingTemplate,
)
from app.modules.marketing.render import personalize, sample_values
from app.modules.support.models import SupportConversation
from app.modules.tenants.models import Tenant
from app.modules.traffic.models import ErpActivity

router = APIRouter(prefix="/admin/marketing", tags=["Super Admin - Marketing"], dependencies=[Depends(get_current_active_superuser)])
public_router = APIRouter(prefix="/global/m", tags=["Marketing tracking"])

UPLOAD_DIR = Path(env.UPLOAD_DIR) / "marketing"
MAX_IMAGE_BYTES = 3_000_000


async def _audit(db: AsyncSession, user: Any, action: str, entity: str, entity_id: Any, summary: str, changes: dict | None = None) -> None:
    await record_audit(db, tenant_id=None, actor_user_id=user.id, actor_name=user.full_name or user.email, action=action, entity_type=entity,
                       entity_id=str(entity_id), summary=summary[:500], changes=changes)


def _dump(obj: Any, *fields: str) -> dict[str, Any]:
    return {f: (str(getattr(obj, f)) if isinstance(getattr(obj, f), uuid.UUID) else getattr(obj, f)) for f in fields}


# ── Overview & analytics ──────────────────────────────────────────────────────

@router.get("/overview")
async def overview(db: DbSession, period: PeriodDep):
    data = await analytics.overview(db, period)
    await db.commit()  # the contact sync it performs
    return success_response(data=data, message="Marketing overview retrieved")


@router.get("/analytics")
async def performance(db: DbSession, period: PeriodDep):
    return success_response(data=await analytics.performance(db, period), message="Marketing analytics retrieved")


# ── Contacts ──────────────────────────────────────────────────────────────────

class Filters(BaseModel):
    q: str | None = None
    countries: list[str] = []
    plans: list[str] = []
    industries: list[str] = []
    sources: list[str] = []
    tags: list[str] = []
    account_status: Literal["active", "suspended"] | None = None
    preferred_contact: Literal["email", "phone", "whatsapp"] | None = None
    consent: Literal["subscribed", "unknown"] | None = None
    newsletter: bool | None = None
    status: Literal["active", "unsubscribed", "bounced", "complained", "invalid"] | None = None
    activity: Literal["active_30d", "inactive_30d", "never"] | None = None
    registered_from: date | None = None
    registered_to: date | None = None

    def clean(self) -> dict[str, Any]:
        return {k: (v.isoformat() if isinstance(v, date) else v) for k, v in self.model_dump().items() if v not in (None, "", [])}


def _filters_from_query(
    q: str | None = None, countries: list[str] = Query([]), plans: list[str] = Query([]), industries: list[str] = Query([]), sources: list[str] = Query([]),
    tags: list[str] = Query([]), account_status: Literal["active", "suspended"] | None = None,
    preferred_contact: Literal["email", "phone", "whatsapp"] | None = None, consent: Literal["subscribed", "unknown"] | None = None,
    newsletter: bool | None = None, status: Literal["active", "unsubscribed", "bounced", "complained", "invalid"] | None = None,
    activity: Literal["active_30d", "inactive_30d", "never"] | None = None, registered_from: date | None = None, registered_to: date | None = None,
) -> dict[str, Any]:
    return Filters(q=q, countries=countries, plans=plans, industries=industries, sources=sources, tags=tags, account_status=account_status,
                   preferred_contact=preferred_contact, consent=consent, newsletter=newsletter, status=status, activity=activity,
                   registered_from=registered_from, registered_to=registered_to).clean()


def _contact_row(c: MarketingContact, t: Tenant | None, last_active: datetime | None, mode: str) -> dict[str, Any]:
    suppressed = c.status != "active" or (t is not None and t.marketing_opt_out)
    eligible = (not suppressed and c.email_valid and (t is None or (t.is_active and t.archived_at is None))
                and (c.consent == "subscribed" if (mode == "opt_in" or t is None) else True))
    return {
        "id": str(c.id), "email": c.email, "name": c.name, "business_name": c.business_name, "tenant_id": str(c.tenant_id) if c.tenant_id else None,
        "phone": c.phone, "country": c.country, "source": c.source, "status": "unsubscribed" if (c.status == "active" and t is not None and t.marketing_opt_out) else c.status,
        "status_reason": c.status_reason, "consent": c.consent, "consent_source": c.consent_source, "consent_at": c.consent_at,
        "newsletter_subscribed": c.newsletter_subscribed, "tags": c.tags or [], "email_valid": c.email_valid, "invalid_reason": c.invalid_reason,
        "eligible": eligible, "created_at": c.created_at,
        "plan": t.subscription_plan if t else None, "industry": t.industry if t else None, "account_active": t.is_active if t else None,
        "preferred_contact": t.preferred_contact if t else None, "registered_at": t.created_at if t else c.created_at, "last_active_at": last_active,
    }


_LAST_ACTIVE = select(ErpActivity.tenant_id, func.max(ErpActivity.created_at).label("last")).group_by(ErpActivity.tenant_id).subquery()


@router.get("/contacts")
async def list_contacts(db: DbSession, page_params: PageQuery, filters: dict = Depends(_filters_from_query),
                        sort: Literal["name", "created", "email", "last_active"] = "created", dir: Literal["asc", "desc"] = "desc"):
    """Contact directory. Syncs businesses into contacts first, so it always reflects the current tenant list."""
    await contacts.sync_tenant_contacts(db)
    await db.commit()
    mode = (await mkt_settings.get_section(db, "compliance"))["consent_mode"]
    where = contacts.filter_conditions(filters)
    total = (await db.execute(contacts.contact_select(func.count()).where(*where))).scalar_one()
    order_col = {"name": func.lower(func.coalesce(MarketingContact.business_name, MarketingContact.name, MarketingContact.email)), "created": MarketingContact.created_at,
                 "email": MarketingContact.email, "last_active": _LAST_ACTIVE.c.last}[sort]
    order = order_col.asc().nulls_last() if dir == "asc" else order_col.desc().nulls_last()
    rows = (await db.execute(contacts.contact_select(MarketingContact, Tenant, _LAST_ACTIVE.c.last).outerjoin(_LAST_ACTIVE, _LAST_ACTIVE.c.tenant_id == Tenant.id)
                             .where(*where).order_by(order, MarketingContact.id).offset(page_params.offset).limit(page_params.limit))).all()
    return paginated_response(items=[_contact_row(c, t, last, mode) for c, t, last in rows], total=total, page=page_params.page,
                              page_size=page_params.page_size, message="Contacts retrieved")


@router.get("/contacts/options")
async def contact_options(db: DbSession):
    """Values for the filter drop-downs: only what exists in the data."""
    async def distinct(col: Any) -> list[str]:
        return [v for (v,) in (await db.execute(select(col).where(col.isnot(None), col != "").distinct().order_by(col).limit(200))).all()]
    tags = (await db.execute(select(func.jsonb_array_elements_text(MarketingContact.tags)).distinct().limit(200))).scalars().all()
    return success_response(data={"countries": await distinct(MarketingContact.country), "plans": await distinct(Tenant.subscription_plan),
                                  "industries": await distinct(Tenant.industry), "tags": sorted(tags)}, message="Options retrieved")


@router.post("/contacts/summary")
async def contacts_summary(data: Filters, db: DbSession, newsletter: bool = False):
    await contacts.sync_tenant_contacts(db)
    await db.commit()
    mode = (await mkt_settings.get_section(db, "compliance"))["consent_mode"]
    return success_response(data=await contacts.audience_summary(db, data.clean(), mode, newsletter=newsletter), message="Audience summary retrieved")


class ContactIn(BaseModel):
    email: str
    name: str | None = Field(default=None, max_length=255)
    business_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    country: str | None = Field(default=None, max_length=100)
    tags: list[str] = []
    consent_source: str = Field(min_length=3, max_length=100)


@router.post("/contacts", status_code=201)
async def add_contact(data: ContactIn, db: DbSession, user: CurrentUser):
    email, bad = contacts.check_email(data.email)
    if bad:
        raise ValidationError(bad)
    if (await db.execute(select(MarketingContact.id).where(MarketingContact.email == email))).first():
        raise ValidationError("That email is already in your contacts")
    c = MarketingContact(email=email, name=data.name, business_name=data.business_name, phone=data.phone, country=data.country, source="manual",
                         tags=sorted({t.strip()[:40] for t in data.tags if t.strip()}), consent="subscribed", consent_source=data.consent_source.strip(), consent_at=datetime.now(UTC))
    db.add(c)
    await db.flush()
    await _audit(db, user, "marketing.contact.add", "marketing_contact", c.id, f"Added contact {email}", {"consent_source": c.consent_source})
    await db.commit()
    return success_response(data={"id": str(c.id)}, message="Contact added", status_code=201)


@router.get("/contacts/{contact_id}")
async def contact_profile(contact_id: uuid.UUID, db: DbSession):
    """A contact's profile: the business, its authorised recipient, preferences and message history."""
    mode = (await mkt_settings.get_section(db, "compliance"))["consent_mode"]
    row = (await db.execute(contacts.contact_select(MarketingContact, Tenant, _LAST_ACTIVE.c.last).outerjoin(_LAST_ACTIVE, _LAST_ACTIVE.c.tenant_id == Tenant.id)
                            .where(MarketingContact.id == contact_id))).first()
    if row is None:
        raise NotFoundError("Contact not found")
    c, t, last = row
    sends = (await db.execute(select(MarketingSend, MarketingCampaign.name, MarketingAutomation.name)
                              .outerjoin(MarketingCampaign, MarketingCampaign.id == MarketingSend.campaign_id).outerjoin(MarketingAutomation, MarketingAutomation.id == MarketingSend.automation_id)
                              .where(MarketingSend.contact_id == c.id).order_by(MarketingSend.queued_at.desc()).limit(25))).all()
    history = (await db.execute(select(AuditLog).where(AuditLog.entity_type == "marketing_contact", AuditLog.entity_id == str(c.id)).order_by(AuditLog.created_at.desc()).limit(25))).scalars().all()
    support = []
    if c.tenant_id:
        support = (await db.execute(select(SupportConversation.id, SupportConversation.channel, SupportConversation.subject, SupportConversation.last_message_at)
                                    .where(SupportConversation.tenant_id == c.tenant_id, SupportConversation.meta["outbound"].astext == "true")
                                    .order_by(SupportConversation.last_message_at.desc().nulls_last()).limit(10))).all()
    return success_response(data={
        "contact": _contact_row(c, t, last, mode),
        "business": ({"id": str(t.id), "name": t.name, "plan": t.subscription_plan, "country": t.country, "city": t.city, "industry": t.industry,
                      "is_active": t.is_active, "preferred_contact": t.preferred_contact, "phone": t.phone, "created_at": t.created_at} if t else None),
        "messages": [{"id": str(s.id), "title": camp or auto or "Message", "kind": "automation" if auto else "campaign", "status": s.status, "reason": s.reason,
                      "sentAt": s.sent_at, "queuedAt": s.queued_at, "opens": s.opens, "clicks": s.clicks, "unsubscribedAt": s.unsubscribed_at} for s, camp, auto in sends],
        "supportOutreach": [{"id": str(i), "channel": ch, "subject": subj, "at": at} for i, ch, subj, at in support],
        "activity": [{"at": h.created_at, "by": h.actor_name, "action": h.action, "summary": h.summary} for h in history],
    }, message="Contact retrieved")


class ContactPatch(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    tags: list[str] | None = None


@router.patch("/contacts/{contact_id}")
async def edit_contact(contact_id: uuid.UUID, data: ContactPatch, db: DbSession, user: CurrentUser):
    c = await db.get(MarketingContact, contact_id)
    if c is None:
        raise NotFoundError("Contact not found")
    if data.name is not None and c.source != "tenant":
        c.name = data.name.strip() or None
    if data.tags is not None:
        c.tags = sorted({t.strip()[:40] for t in data.tags if t.strip()})
    await _audit(db, user, "marketing.contact.update", "marketing_contact", c.id, f"Updated contact {c.email}", data.model_dump(exclude_none=True))
    await db.commit()
    return success_response(message="Contact updated")


class BulkIn(BaseModel):
    ids: list[uuid.UUID] = []
    filters: Filters | None = None  # with all_matching: apply to everything the filters match
    all_matching: bool = False
    action: Literal["add_tags", "remove_tags", "consent", "newsletter_on", "newsletter_off", "suppress", "reactivate", "delete"]
    tags: list[str] = []
    consent_source: str | None = None
    reason: str | None = None


@router.post("/contacts/bulk")
async def bulk_contacts(data: BulkIn, db: DbSession, user: CurrentUser):
    ids = data.ids
    if data.all_matching:
        ids = list((await db.execute(contacts.contact_select(MarketingContact.id).where(*contacts.filter_conditions((data.filters or Filters()).clean())).limit(contacts.MAX_BULK + 1))).scalars().all())
    changed = await contacts.bulk_apply(db, ids, data.action, tags=data.tags, consent_source=data.consent_source, reason=data.reason)
    await _audit(db, user, f"marketing.contact.{data.action}", "marketing_contact_bulk", uuid.uuid4(), f"{data.action} on {len(ids)} contacts ({changed} changed)",
                 {"tags": data.tags, "consent_source": data.consent_source, "count": len(ids)})
    await db.commit()
    return success_response(data={"changed": changed, "selected": len(ids)}, message="Done")


class ImportIn(BaseModel):
    csv: str
    consent_source: str = Field(min_length=3, max_length=100)
    tags: list[str] = []
    dry_run: bool = True
    confirm_permission: bool = False


@router.post("/contacts/import", dependencies=[Depends(rate_limit("marketing-import", 20, 3600))])
async def import_contacts(data: ImportIn, db: DbSession, user: CurrentUser):
    if not data.dry_run and not data.confirm_permission:
        raise ValidationError("Confirm that these people agreed to receive email from you")
    result = await contacts.import_preview_or_run(db, data.csv, consent_source=data.consent_source.strip(), tags=data.tags, dry_run=data.dry_run)
    if not data.dry_run:
        await _audit(db, user, "marketing.contact.import", "marketing_contact_import", uuid.uuid4(), f"Imported {result['new']} contacts ({data.consent_source})", {k: v for k, v in result.items() if k != "problems"})
    await db.commit()
    return success_response(data=result, message="Import checked" if data.dry_run else "Import complete")


# ── Segments ──────────────────────────────────────────────────────────────────

class SegmentIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=300)
    filters: Filters


@router.get("/segments")
async def list_segments(db: DbSession):
    mode = (await mkt_settings.get_section(db, "compliance"))["consent_mode"]
    segs = (await db.execute(select(MarketingSegment).order_by(MarketingSegment.name))).scalars().all()
    out = []
    for s in segs:
        summary = await contacts.audience_summary(db, s.filters, mode)
        out.append({"id": str(s.id), "name": s.name, "description": s.description, "filters": s.filters, "matched": summary["matched"], "eligible": summary["eligible"]})
    return success_response(data=out, message="Segments retrieved")


@router.post("/segments", status_code=201)
async def create_segment(data: SegmentIn, db: DbSession, user: CurrentUser):
    if (await db.execute(select(MarketingSegment.id).where(func.lower(MarketingSegment.name) == data.name.strip().lower()))).first():
        raise ValidationError("A segment with that name already exists")
    s = MarketingSegment(name=data.name.strip(), description=data.description, filters=data.filters.clean(), created_by=user.id)
    db.add(s)
    await db.flush()
    await _audit(db, user, "marketing.segment.create", "marketing_segment", s.id, f"Created segment “{s.name}”", s.filters)
    await db.commit()
    return success_response(data={"id": str(s.id)}, message="Segment saved", status_code=201)


@router.put("/segments/{segment_id}")
async def update_segment(segment_id: uuid.UUID, data: SegmentIn, db: DbSession, user: CurrentUser):
    s = await db.get(MarketingSegment, segment_id)
    if s is None:
        raise NotFoundError("Segment not found")
    s.name, s.description, s.filters = data.name.strip(), data.description, data.filters.clean()
    await _audit(db, user, "marketing.segment.update", "marketing_segment", s.id, f"Updated segment “{s.name}”", s.filters)
    await db.commit()
    return success_response(message="Segment saved")


@router.delete("/segments/{segment_id}")
async def delete_segment(segment_id: uuid.UUID, db: DbSession, user: CurrentUser):
    s = await db.get(MarketingSegment, segment_id)
    if s is None:
        raise NotFoundError("Segment not found")
    await _audit(db, user, "marketing.segment.delete", "marketing_segment", s.id, f"Deleted segment “{s.name}”")
    await db.delete(s)
    await db.commit()
    return success_response(message="Segment deleted")


# ── Templates, rendering and image uploads ───────────────────────────────────

def _tpl(t: MarketingTemplate) -> dict[str, Any]:
    return {**_dump(t, "id", "name", "category", "description", "subject", "preheader", "status", "is_system", "created_at", "updated_at"), "blocks": t.blocks}


class TemplateIn(BaseModel):
    name: str | None = None
    category: str | None = None
    description: str | None = None
    subject: str | None = None
    preheader: str | None = None
    blocks: list[dict[str, Any]] | None = None


@router.get("/templates")
async def list_templates(db: DbSession, q: str | None = None, category: str | None = None, status: Literal["active", "archived"] = "active"):
    items = await templates.list_templates(db, q=q, category=category, status=status)
    await db.commit()
    return success_response(data=[_tpl(t) for t in items], message="Templates retrieved")


@router.post("/templates", status_code=201)
async def create_template(data: TemplateIn, db: DbSession, user: CurrentUser):
    t = await templates.create(db, user.id, data.model_dump(exclude_none=True))
    await _audit(db, user, "marketing.template.create", "marketing_template", t.id, f"Created template “{t.name}”")
    await db.commit()
    await db.refresh(t)  # server-side columns (updated_at) are expired by the commit
    return success_response(data=_tpl(t), message="Template created", status_code=201)


@router.get("/templates/{template_id}")
async def get_template(template_id: uuid.UUID, db: DbSession):
    return success_response(data=_tpl(await templates.get(db, template_id)), message="Template retrieved")


@router.patch("/templates/{template_id}")
async def update_template(template_id: uuid.UUID, data: TemplateIn, db: DbSession, user: CurrentUser):
    t = await templates.update(db, template_id, data.model_dump(exclude_none=True))
    await _audit(db, user, "marketing.template.update", "marketing_template", t.id, f"Updated template “{t.name}”")
    await db.commit()
    await db.refresh(t)  # server-side columns (updated_at) are expired by the commit
    return success_response(data=_tpl(t), message="Template saved")


@router.post("/templates/{template_id}/duplicate", status_code=201)
async def duplicate_template(template_id: uuid.UUID, db: DbSession, user: CurrentUser):
    t = await templates.duplicate(db, template_id, user.id)
    await _audit(db, user, "marketing.template.create", "marketing_template", t.id, f"Duplicated template into “{t.name}”")
    await db.commit()
    await db.refresh(t)  # server-side columns (updated_at) are expired by the commit
    return success_response(data=_tpl(t), message="Template duplicated", status_code=201)


@router.post("/templates/{template_id}/archive")
async def archive_template(template_id: uuid.UUID, db: DbSession, user: CurrentUser):
    t = await templates.set_archived(db, template_id, True)
    await _audit(db, user, "marketing.template.archive", "marketing_template", t.id, f"Archived template “{t.name}”")
    await db.commit()
    return success_response(message="Template archived")


@router.post("/templates/{template_id}/restore")
async def restore_template(template_id: uuid.UUID, db: DbSession, user: CurrentUser):
    t = await templates.set_archived(db, template_id, False)
    await _audit(db, user, "marketing.template.restore", "marketing_template", t.id, f"Restored template “{t.name}”")
    await db.commit()
    return success_response(message="Template restored")


class RenderIn(BaseModel):
    blocks: list[dict[str, Any]]
    subject: str = ""
    preheader: str = ""


@router.post("/render")
async def render_preview(data: RenderIn, db: DbSession):
    """The exact HTML and plain text recipients get, with sample data in the variables."""
    from app.modules.marketing.render import clean_blocks

    cfg = await mkt_settings.get_all(db)
    html, text = engine.render_for(clean_blocks(data.blocks), subject=data.subject, preheader=data.preheader, cfg=cfg)
    values = sample_values()
    return success_response(data={"html": personalize(html, values, html_mode=True), "text": personalize(text, values, html_mode=False),
                                  "subject": personalize(data.subject, values, html_mode=False)}, message="Rendered")


@router.post("/uploads", status_code=201, dependencies=[Depends(rate_limit("marketing-upload", 60, 60))])
async def upload_image(user: CurrentUser, file: UploadFile = File(...)):
    """Stores an email image in the shared uploads folder (served at /uploads) after verifying it really is an image."""
    from PIL import Image, UnidentifiedImageError

    data = await file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise ValidationError("Images can be up to 3 MB")
    try:
        img = Image.open(io.BytesIO(data))
        fmt = (img.format or "").lower()
        img.verify()
    except (UnidentifiedImageError, OSError):
        raise ValidationError("That file isn't a valid image") from None
    if fmt not in ("png", "jpeg", "webp", "gif") or max(img.size) > 5000:
        raise ValidationError("Use a PNG, JPEG, WebP or GIF up to 5000 px wide")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.{'jpg' if fmt == 'jpeg' else fmt}"
    (UPLOAD_DIR / name).write_bytes(data)
    return success_response(data={"url": f"{env.API_PUBLIC_URL.rstrip('/')}/uploads/marketing/{name}", "width": img.size[0], "height": img.size[1]}, message="Uploaded", status_code=201)


# ── Campaigns & newsletters ───────────────────────────────────────────────────

CAMPAIGN_FIELDS = ("id", "kind", "parent_id", "name", "campaign_type", "subject", "preheader", "sender_name", "sender_email", "reply_to", "template_id",
                   "status", "scheduled_at", "started_at", "completed_at", "recipient_count", "created_at", "updated_at")


def _camp(c: MarketingCampaign, stats: dict[str, Any] | None = None) -> dict[str, Any]:
    return {**_dump(c, *CAMPAIGN_FIELDS), "blocks": c.blocks, "audience": c.audience, "schedule": c.schedule, **(stats or {})}


class CampaignIn(BaseModel):
    name: str | None = None
    campaign_type: str | None = None
    subject: str | None = None
    preheader: str | None = None
    sender_name: str | None = None
    sender_email: str | None = None
    reply_to: str | None = None
    template_id: uuid.UUID | None = None
    blocks: list[dict[str, Any]] | None = None
    audience: dict[str, Any] | None = None
    schedule: dict[str, Any] | None = None
    kind: Literal["campaign", "newsletter"] = "campaign"


@router.get("/campaigns")
async def list_campaigns(db: DbSession, page_params: PageQuery, kind: Literal["campaign", "newsletter", "issue"] | None = None, status: str | None = None,
                         q: str | None = None, parent_id: uuid.UUID | None = None):
    stmt = select(MarketingCampaign)
    if kind == "campaign":
        stmt = stmt.where(MarketingCampaign.kind.in_(("campaign", "issue")), MarketingCampaign.parent_id.is_(None))
    elif kind:
        stmt = stmt.where(MarketingCampaign.kind == kind)
    if parent_id:
        stmt = stmt.where(MarketingCampaign.parent_id == parent_id)
    if status:
        stmt = stmt.where(MarketingCampaign.status == status)
    if q and q.strip():
        stmt = stmt.where(MarketingCampaign.name.ilike(f"%{q.strip()}%"))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (await db.execute(stmt.order_by(MarketingCampaign.created_at.desc()).offset(page_params.offset).limit(page_params.limit))).scalars().all()
    stats = await analytics._campaign_stats(db, [c.id for c in rows])
    return paginated_response(items=[_camp(c, stats.get(c.id)) for c in rows], total=total, page=page_params.page, page_size=page_params.page_size, message="Campaigns retrieved")


@router.post("/campaigns", status_code=201)
async def create_campaign(data: CampaignIn, db: DbSession, user: CurrentUser):
    c = await campaigns.create(db, user.id, data.model_dump(exclude_none=True, exclude={"kind"}), data.kind)
    await _audit(db, user, "marketing.campaign.create", "marketing_campaign", c.id, f"Created {c.kind} “{c.name}”")
    await db.commit()
    await db.refresh(c)  # server-side columns (updated_at) are expired by the commit
    return success_response(data=_camp(c), message="Draft created", status_code=201)


@router.get("/campaigns/{campaign_id}")
async def get_campaign(campaign_id: uuid.UUID, db: DbSession):
    c = await campaigns.get(db, campaign_id)
    stats = await analytics._campaign_stats(db, [c.id])
    return success_response(data=_camp(c, stats.get(c.id)), message="Campaign retrieved")


@router.patch("/campaigns/{campaign_id}")
async def update_campaign(campaign_id: uuid.UUID, data: CampaignIn, db: DbSession, user: CurrentUser):
    c = await campaigns.update_campaign(db, campaign_id, data.model_dump(exclude_unset=True, exclude={"kind"}))
    await _audit(db, user, "marketing.campaign.update", "marketing_campaign", c.id, f"Edited {c.kind} “{c.name}”")
    await db.commit()
    await db.refresh(c)  # server-side columns (updated_at) are expired by the commit
    return success_response(data=_camp(c), message="Saved")


@router.post("/campaigns/{campaign_id}/duplicate", status_code=201)
async def duplicate_campaign(campaign_id: uuid.UUID, db: DbSession, user: CurrentUser):
    c = await campaigns.duplicate(db, campaign_id, user.id)
    await _audit(db, user, "marketing.campaign.create", "marketing_campaign", c.id, f"Duplicated into “{c.name}”")
    await db.commit()
    await db.refresh(c)  # server-side columns (updated_at) are expired by the commit
    return success_response(data=_camp(c), message="Campaign duplicated", status_code=201)


@router.get("/campaigns/{campaign_id}/readiness")
async def campaign_readiness(campaign_id: uuid.UUID, db: DbSession):
    c = await campaigns.get(db, campaign_id)
    await contacts.sync_tenant_contacts(db)
    data = await campaigns.readiness(db, c)
    await db.commit()
    return success_response(data=data, message="Checked")


class SendIn(BaseModel):
    confirm_recipients: int = Field(ge=0)  # the recipient count the admin saw and confirmed — stops sending to a changed audience unseen


@router.post("/campaigns/{campaign_id}/send", dependencies=[Depends(rate_limit("marketing-send", 20, 3600))])
async def send_campaign(campaign_id: uuid.UUID, data: SendIn, db: DbSession, user: CurrentUser):
    c = await campaigns.get(db, campaign_id)
    ready = await campaigns.readiness(db, c)
    if ready["audience"]["eligible"] != data.confirm_recipients:
        raise ValidationError(f"The audience changed: {ready['audience']['eligible']:,} people are now eligible. Review and confirm again.")
    c = await campaigns.start_sending(db, campaign_id, actor=user.email)
    await _audit(db, user, "marketing.campaign.send", "marketing_campaign", c.id, f"Started sending “{c.name}” to {c.recipient_count} recipients", {"recipients": c.recipient_count})
    await db.commit()
    await db.refresh(c)  # server-side columns (updated_at) are expired by the commit
    return success_response(data=_camp(c), message="Sending started")


class ScheduleIn(BaseModel):
    at: datetime
    confirm_recipients: int = Field(ge=0)


@router.post("/campaigns/{campaign_id}/schedule")
async def schedule_campaign(campaign_id: uuid.UUID, data: ScheduleIn, db: DbSession, user: CurrentUser):
    c = await campaigns.get(db, campaign_id)
    ready = await campaigns.readiness(db, c)
    if ready["audience"]["eligible"] != data.confirm_recipients:
        raise ValidationError(f"The audience changed: {ready['audience']['eligible']:,} people are now eligible. Review and confirm again.")
    c = await campaigns.schedule(db, campaign_id, data.at)
    await _audit(db, user, "marketing.campaign.schedule", "marketing_campaign", c.id, f"Scheduled “{c.name}” for {c.scheduled_at:%Y-%m-%d %H:%M} UTC")
    await db.commit()
    await db.refresh(c)  # server-side columns (updated_at) are expired by the commit
    return success_response(data=_camp(c), message="Scheduled")


@router.post("/campaigns/{campaign_id}/unschedule")
async def unschedule_campaign(campaign_id: uuid.UUID, db: DbSession, user: CurrentUser):
    c = await campaigns.unschedule(db, campaign_id)
    await _audit(db, user, "marketing.campaign.unschedule", "marketing_campaign", c.id, f"Moved “{c.name}” back to draft")
    await db.commit()
    await db.refresh(c)  # server-side columns (updated_at) are expired by the commit
    return success_response(data=_camp(c), message="Moved back to draft")


class TestIn(BaseModel):
    to: str


@router.post("/campaigns/{campaign_id}/test", dependencies=[Depends(rate_limit("marketing-test", 20, 600))])
async def test_campaign(campaign_id: uuid.UUID, data: TestIn, db: DbSession, user: CurrentUser):
    c = await campaigns.get(db, campaign_id)
    await campaigns.send_test(db, c, data.to)
    await _audit(db, user, "marketing.campaign.test", "marketing_campaign", c.id, f"Sent a test of “{c.name}” to {data.to.strip().lower()}")
    await db.commit()
    return success_response(message="Test email sent")


@router.get("/campaigns/{campaign_id}/results")
async def campaign_results(campaign_id: uuid.UUID, db: DbSession):
    return success_response(data=await campaigns.results(db, campaign_id), message="Results retrieved")


@router.get("/campaigns/{campaign_id}/recipients")
async def campaign_recipients(campaign_id: uuid.UUID, db: DbSession, page_params: PageQuery, status: str | None = None):
    stmt = select(MarketingSend, MarketingContact.business_name, MarketingContact.name).join(MarketingContact, MarketingContact.id == MarketingSend.contact_id).where(MarketingSend.campaign_id == campaign_id)
    if status:
        stmt = stmt.where(MarketingSend.status == status)
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (await db.execute(stmt.order_by(MarketingSend.queued_at, MarketingSend.id).offset(page_params.offset).limit(page_params.limit))).all()
    return paginated_response(items=[{"id": str(s.id), "contact": biz or name or s.email, "email": s.email, "status": s.status, "reason": s.reason, "sentAt": s.sent_at,
                                      "opens": s.opens, "clicks": s.clicks, "unsubscribed": s.unsubscribed_at is not None} for s, biz, name in rows],
                              total=total, page=page_params.page, page_size=page_params.page_size, message="Recipients retrieved")


@router.post("/campaigns/{campaign_id}/activate")
async def activate_newsletter(campaign_id: uuid.UUID, db: DbSession, user: CurrentUser):
    n = await campaigns.activate_newsletter(db, campaign_id)
    await _audit(db, user, "marketing.newsletter.activate", "marketing_campaign", n.id, f"Activated newsletter “{n.name}”", n.schedule)
    await db.commit()
    await db.refresh(n)  # server-side columns (updated_at) are expired by the commit
    return success_response(data=_camp(n), message="Newsletter is active")


@router.post("/campaigns/{campaign_id}/publish-issue", dependencies=[Depends(rate_limit("marketing-send", 20, 3600))])
async def publish_issue(campaign_id: uuid.UUID, data: SendIn, db: DbSession, user: CurrentUser):
    n = await campaigns.get(db, campaign_id)
    ready = await campaigns.readiness(db, n)
    if ready["audience"]["eligible"] != data.confirm_recipients:
        raise ValidationError(f"The audience changed: {ready['audience']['eligible']:,} subscribers are now eligible. Review and confirm again.")
    issue = await campaigns.publish_issue(db, campaign_id, actor=user.email)
    await _audit(db, user, "marketing.newsletter.issue", "marketing_campaign", issue.id, f"Sent issue “{issue.name}” to {issue.recipient_count} subscribers")
    await db.commit()
    await db.refresh(issue)  # server-side columns (updated_at) are expired by the commit
    return success_response(data=_camp(issue), message="Issue is sending")


# Registered last among the campaign routes so the literal paths above (test, activate, publish-issue…) take precedence.
@router.post("/campaigns/{campaign_id}/{action}")
async def campaign_action(campaign_id: uuid.UUID, action: Literal["pause", "resume", "cancel"], db: DbSession, user: CurrentUser):
    n = await campaigns.get(db, campaign_id)
    c = await (campaigns.pause_newsletter(db, campaign_id) if (n.kind == "newsletter" and action == "pause") else campaigns.set_state(db, campaign_id, action))
    await _audit(db, user, f"marketing.campaign.{action}", "marketing_campaign", c.id, f"{action.title()}d “{c.name}”")
    await db.commit()
    await db.refresh(c)  # server-side columns (updated_at) are expired by the commit
    return success_response(data=_camp(c), message="Done")


# ── Automations ───────────────────────────────────────────────────────────────

class AutomationIn(BaseModel):
    kind: str | None = None
    name: str | None = None
    subject: str | None = None
    preheader: str | None = None
    blocks: list[dict[str, Any]] | None = None
    delay_hours: int | None = None
    params: dict[str, int] | None = None
    template_id: uuid.UUID | None = None


def _auto(a: MarketingAutomation, stats: dict[str, int] | None = None) -> dict[str, Any]:
    return {**_dump(a, "id", "name", "kind", "trigger", "delay_hours", "template_id", "subject", "preheader", "active", "activated_at", "last_run_at", "created_at"),
            "params": a.params, "blocks": a.blocks, "triggerText": automations.describe_trigger(a),
            "stats": stats or {"total": 0, "sent": 0, "queued": 0, "failed": 0, "skipped": 0, "opened": 0, "clicked": 0, "unsubscribed": 0}}


@router.get("/automations")
async def list_automations(db: DbSession):
    items = (await db.execute(select(MarketingAutomation).order_by(MarketingAutomation.created_at))).scalars().all()
    stats = await automations.stats(db, [a.id for a in items])
    kinds = [{"kind": k, "label": v["label"], "trigger": v["trigger"], "params": v["params"]} for k, v in automations.KINDS.items()]
    return success_response(data={"items": [_auto(a, stats.get(a.id)) for a in items], "kinds": kinds}, message="Automations retrieved")


@router.post("/automations", status_code=201)
async def create_automation(data: AutomationIn, db: DbSession, user: CurrentUser):
    if not data.kind:
        raise ValidationError("Choose an automation type")
    a = await automations.create(db, user.id, data.kind, data.model_dump(exclude_none=True, exclude={"kind"}))
    await _audit(db, user, "marketing.automation.create", "marketing_automation", a.id, f"Created automation “{a.name}”")
    await db.commit()
    await db.refresh(a)  # server-side columns (updated_at) are expired by the commit
    return success_response(data=_auto(a), message="Automation created", status_code=201)


@router.patch("/automations/{automation_id}")
async def update_automation(automation_id: uuid.UUID, data: AutomationIn, db: DbSession, user: CurrentUser):
    a = await automations.update(db, automation_id, data.model_dump(exclude_unset=True, exclude={"kind"}))
    await _audit(db, user, "marketing.automation.update", "marketing_automation", a.id, f"Edited automation “{a.name}”")
    await db.commit()
    await db.refresh(a)  # server-side columns (updated_at) are expired by the commit
    return success_response(data=_auto(a), message="Saved")


@router.post("/automations/{automation_id}/{action}")
async def automation_action(automation_id: uuid.UUID, action: Literal["activate", "pause", "run"], db: DbSession, user: CurrentUser):
    if action == "run":
        a = await automations.get(db, automation_id)
        if a.trigger != "manual" or not a.active:
            raise ValidationError("Only an active announcement can be run manually")
        queued = await automations.enqueue(db, a, limit=automations.BATCH * 10)
        await _audit(db, user, "marketing.automation.run", "marketing_automation", a.id, f"Ran “{a.name}”: {queued} messages queued")
        await db.commit()
        return success_response(data={"queued": queued}, message=f"{queued} messages queued")
    a = await automations.set_active(db, automation_id, action == "activate")
    await _audit(db, user, f"marketing.automation.{action}", "marketing_automation", a.id, f"{'Activated' if a.active else 'Paused'} automation “{a.name}”")
    await db.commit()
    await db.refresh(a)  # server-side columns (updated_at) are expired by the commit
    return success_response(data=_auto(a), message="Done")


@router.delete("/automations/{automation_id}")
async def delete_automation(automation_id: uuid.UUID, db: DbSession, user: CurrentUser):
    a = await automations.get(db, automation_id)
    if a.active:
        raise ValidationError("Pause the automation before deleting it")
    await _audit(db, user, "marketing.automation.delete", "marketing_automation", a.id, f"Deleted automation “{a.name}”")
    await db.execute(delete(MarketingAutomation).where(MarketingAutomation.id == a.id))
    await db.commit()
    return success_response(message="Automation deleted")


@router.get("/automations/{automation_id}/history")
async def automation_history(automation_id: uuid.UUID, db: DbSession):
    return success_response(data=await automations.history(db, automation_id), message="History retrieved")


# ── Settings ──────────────────────────────────────────────────────────────────

@router.get("/settings")
async def get_settings(db: DbSession):
    cfg = await mkt_settings.get_all(db)
    return success_response(data={**cfg, "provider": mkt_settings.provider_status(),
                                  "safeMode": {"active": engine.safe_mode(), "allowedRecipients": len(contacts.safe_recipients()), "environment": env.ENVIRONMENT}},
                            message="Settings retrieved")


class SettingsIn(BaseModel):
    values: dict[str, Any]


@router.put("/settings/{section}")
async def save_settings(section: Literal["general", "brand", "compliance"], data: SettingsIn, db: DbSession, user: CurrentUser):
    before, after = await mkt_settings.save_section(db, section, data.values)
    changed = {k: {"from": before.get(k), "to": v} for k, v in after.items() if before.get(k) != v}
    await _audit(db, user, f"marketing.settings.{section}", "marketing_settings", section, f"Changed marketing {section} settings", changed)
    await db.commit()
    return success_response(data=after, message="Settings saved")


@router.get("/settings/domain")
async def check_domain(db: DbSession, domain: str | None = None):
    cfg = await mkt_settings.get_section(db, "general")
    dom = (domain or "").strip().lower() or mkt_settings.sender_domain(cfg["sender_email"] or _resolve_smtp_credentials("marketing")[2])
    return success_response(data=await mkt_settings.domain_status(dom), message="Domain checked")


@router.post("/settings/test-connection", dependencies=[Depends(rate_limit("marketing-connection", 10, 60))])
async def test_connection():
    """Signs in to the SMTP server without sending anything."""
    status = mkt_settings.provider_status()
    if not status["configured"]:
        return success_response(data={"ok": False, "error": "No SMTP account is configured on the server"}, message="Not configured")
    user, password, _ = _resolve_smtp_credentials("marketing")

    def _login() -> None:
        with smtplib.SMTP(env.SMTP_HOST, env.SMTP_PORT, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(user, password)

    try:
        await asyncio.to_thread(_login)
        return success_response(data={"ok": True, "error": None}, message="Connected")
    except (OSError, smtplib.SMTPException) as e:
        return success_response(data={"ok": False, "error": f"SMTP sign-in failed ({type(e).__name__})"}, message="Connection failed")


@router.post("/settings/test-send", dependencies=[Depends(rate_limit("marketing-test", 20, 600))])
async def settings_test_send(data: TestIn, db: DbSession, user: CurrentUser):
    email, bad = contacts.check_email(data.to)
    if not email or (bad and bad != "Test or placeholder domain"):
        raise ValidationError("Enter a valid email address")
    if not mkt_settings.outbound_configured():
        raise ValidationError("No email provider is configured on the server")
    cfg = await mkt_settings.get_all(db)
    try:
        await send_email_message(email, "Pesaa Marketing — test email", "<p>If you can read this, marketing email sending works.</p>", "If you can read this, marketing email sending works.",
                                 sender="marketing", from_header=engine.from_header(cfg, None), raise_errors=True)
    except EmailDeliveryError:
        raise ValidationError("The mail server didn't accept the test message") from None
    await _audit(db, user, "marketing.settings.test_send", "marketing_settings", "provider", f"Sent a provider test to {email}")
    await db.commit()
    return success_response(message="Test email sent")


@router.get("/settings/suppressions")
async def suppressions(db: DbSession, page_params: PageQuery, q: str | None = None):
    stmt = select(MarketingContact).where(or_(MarketingContact.status != "active", MarketingContact.email_valid.is_(False)))
    if q and q.strip():
        stmt = stmt.where(MarketingContact.email.ilike(f"%{q.strip()}%"))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (await db.execute(stmt.order_by(MarketingContact.status_at.desc().nulls_last(), MarketingContact.email).offset(page_params.offset).limit(page_params.limit))).scalars().all()
    return paginated_response(items=[{"id": str(c.id), "email": c.email, "business_name": c.business_name, "status": c.status if c.status != "active" else "invalid",
                                      "reason": c.status_reason or c.invalid_reason, "at": c.status_at, "source": c.source} for c in rows],
                              total=total, page=page_params.page, page_size=page_params.page_size, message="Suppressions retrieved")


@router.get("/settings/audit")
async def audit_history(db: DbSession, page_params: PageQuery):
    stmt = select(AuditLog).where(AuditLog.action.like("marketing.%"))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (await db.execute(stmt.order_by(AuditLog.created_at.desc()).offset(page_params.offset).limit(page_params.limit))).scalars().all()
    return paginated_response(items=[{"id": str(a.id), "at": a.created_at, "by": a.actor_name, "action": a.action, "summary": a.summary} for a in rows],
                              total=total, page=page_params.page, page_size=page_params.page_size, message="Audit history retrieved")


# ── Public tracking & unsubscribe ─────────────────────────────────────────────

_PIXEL = bytes.fromhex("47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b")
_PAGE = ("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>{t}</title>"
         "<body style='font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 20px;color:#10182d'>"
         "<h1 style='font-size:22px'>{t}</h1><p style='color:#5b6478'>{p}</p>{extra}</body>")


@public_router.get("/o/{send_id}.gif")
async def open_pixel(send_id: uuid.UUID, db: DbSession):
    await tracking.record(db, send_id, "open")
    return Response(_PIXEL, media_type="image/gif", headers={"Cache-Control": "no-store, max-age=0"})


@public_router.get("/c/{token}")
async def click(token: str, db: DbSession):
    parsed = tracking.read_click(token)
    if parsed is None or not parsed[1]:
        return HTMLResponse(_PAGE.format(t="This link isn't valid", p="The link is invalid or has been altered.", extra=""), status_code=400)
    await tracking.record(db, parsed[0], "click", parsed[1])
    return RedirectResponse(parsed[1], status_code=302)


@public_router.get("/u/{token}", response_class=HTMLResponse, dependencies=[Depends(rate_limit("marketing-unsub-page", 60, 3600))])
async def unsubscribe_page(token: str):
    """Shows a confirm button: merely opening the link (a mail scanner, a preview) never unsubscribes anyone."""
    if tracking.read_unsubscribe(token) is None:
        return HTMLResponse(_PAGE.format(t="This link isn't valid", p="The unsubscribe link is invalid. Reply to the email and we'll remove you.", extra=""), status_code=400)
    form = (f"<form method=post action='/api/v1/global/m/u/{token}'><button style='background:#16A34A;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-size:15px;"
            "font-weight:600;cursor:pointer'>Unsubscribe</button></form>")
    return HTMLResponse(_PAGE.format(t="Unsubscribe from Pesaa emails?", p="You'll stop receiving marketing messages. Account and support emails are not affected.", extra=form))


@public_router.post("/u/{token}", response_class=HTMLResponse, dependencies=[Depends(rate_limit("marketing-unsub", 30, 3600))])
async def unsubscribe_confirm(token: str, request: Request, db: DbSession):
    """Also the RFC 8058 one-click target (mail apps POST here directly)."""
    parsed = tracking.read_unsubscribe(token)
    ok = parsed is not None and await tracking.unsubscribe(db, *parsed)
    if "list-unsubscribe=one-click" in (await request.body()).decode(errors="ignore").lower():
        return Response(status_code=200 if ok else 400)
    return HTMLResponse(_PAGE.format(t="You're unsubscribed" if ok else "This link isn't valid",
                                     p="We won't send you marketing messages any more." if ok else "The unsubscribe link is invalid.", extra=""), status_code=200 if ok else 400)

