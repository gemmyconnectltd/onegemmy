"""Reusable email templates. Campaigns, newsletters and automations COPY a template's blocks when they are created, so
editing or archiving a template never changes mail that is already scheduled or running."""
import uuid
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.marketing.models import MarketingTemplate
from app.modules.marketing.render import blocks_text, clean_blocks, unknown_variables

CATEGORIES = ("campaign", "newsletter", "onboarding", "announcement", "transactional")


def _b(kind: str, **props: Any) -> dict[str, Any]:
    return {"id": uuid.uuid4().hex[:8], "type": kind, "props": props}


SYSTEM_TEMPLATES: list[dict[str, Any]] = [
    {"name": "Product announcement", "category": "announcement", "subject": "What's new at Pesaa", "preheader": "A quick look at what we've added.",
     "description": "Announce a new feature or improvement.",
     "blocks": [_b("header"), _b("heading", text="Something new for {{business_name}}", level=1), _b("paragraph", text="Hi {{first_name}},\n\nWe've added something we think your team will find useful. Describe the update here in two or three sentences."),
                _b("button", label="See what's new", url="https://pesaa.io", align="center"), _b("paragraph", text="Questions? Just reply to this email.")]},
    {"name": "Monthly newsletter", "category": "newsletter", "subject": "Pesaa news — {{business_name}}", "preheader": "Tips and updates for running your business.",
     "description": "Editorial layout with a featured story and two highlights.",
     "blocks": [_b("header", tagline="News & tips"), _b("heading", text="This month at Pesaa", level=1), _b("paragraph", text="Hi {{first_name}},\n\nHere is what's new and what we're learning from businesses like yours."),
                _b("divider"), _b("columns", items=[{"title": "Highlight one", "text": "A short description of the first story.", "label": "Read more", "url": "https://pesaa.io"},
                                                    {"title": "Highlight two", "text": "A short description of the second story.", "label": "Read more", "url": "https://pesaa.io"}]),
                _b("button", label="Visit Pesaa", url="https://pesaa.io", align="center")]},
    {"name": "Welcome", "category": "onboarding", "subject": "Welcome to Pesaa, {{first_name}}", "preheader": "Here is how to get started.",
     "description": "First message to a new business.",
     "blocks": [_b("header"), _b("heading", text="Welcome, {{business_name}}", level=1), _b("paragraph", text="Hi {{first_name}},\n\nThanks for joining Pesaa. Here are three good first steps: add your products, record a first sale, and invite your team."),
                _b("button", label="Open your dashboard", url="https://app.pesaa.io", align="center"), _b("paragraph", text="If you need a hand, reply to this email and our team will help.")]},
    {"name": "Onboarding follow-up", "category": "onboarding", "subject": "Need a hand getting started, {{first_name}}?", "preheader": "We're here to help you record your first sale.",
     "description": "Nudge for businesses that haven't recorded a sale yet.",
     "blocks": [_b("header"), _b("heading", text="Let's get {{business_name}} up and running", level=2), _b("paragraph", text="Hi {{first_name}},\n\nWe noticed you haven't recorded a sale yet. It only takes a minute — and we're happy to walk you through it."),
                _b("button", label="Record your first sale", url="https://app.pesaa.io", align="center")]},
    {"name": "Renewal reminder", "category": "campaign", "subject": "Your Pesaa subscription renews soon", "preheader": "A quick heads-up about your renewal.",
     "description": "Reminder ahead of a subscription renewal.",
     "blocks": [_b("header"), _b("heading", text="Your subscription renews soon", level=2), _b("paragraph", text="Hi {{first_name}},\n\nThis is a reminder that the subscription for {{business_name}} is due to renew shortly. You can review your plan and payment details in your account."),
                _b("button", label="Review your plan", url="https://app.pesaa.io", align="center")]},
    {"name": "We'd love to hear from you", "category": "campaign", "subject": "We haven't seen you in a while, {{first_name}}", "preheader": "Is there anything we can help with?",
     "description": "Re-engage businesses that have gone quiet.",
     "blocks": [_b("header"), _b("heading", text="Is there anything we can help with?", level=2), _b("paragraph", text="Hi {{first_name}},\n\nWe noticed {{business_name}} hasn't used Pesaa recently. If something got in the way, tell us — we'd like to make it right."),
                _b("button", label="Open Pesaa", url="https://app.pesaa.io", align="center")]},
]


async def ensure_system_templates(db: AsyncSession) -> None:
    """Creates the starter templates the first time they are needed. Does not commit."""
    if (await db.execute(select(func.count()).select_from(MarketingTemplate).where(MarketingTemplate.is_system.is_(True)))).scalar_one():
        return
    for t in SYSTEM_TEMPLATES:
        db.add(MarketingTemplate(**t, is_system=True))
    await db.flush()


def _validated(data: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    if "name" in data:
        out["name"] = str(data["name"] or "").strip()[:160]
        if not out["name"]:
            raise ValidationError("Give the template a name")
    if "category" in data:
        if data["category"] not in CATEGORIES:
            raise ValidationError("Choose a valid category")
        out["category"] = data["category"]
    for k, n in (("description", 300), ("subject", 300), ("preheader", 200)):
        if k in data:
            out[k] = (str(data[k] or "").strip()[:n]) or None
    if "blocks" in data:
        out["blocks"] = clean_blocks(data["blocks"])
    if bad := unknown_variables(out.get("subject") or "", out.get("preheader") or "", blocks_text(out.get("blocks", []))):
        raise ValidationError("Unknown variable: " + ", ".join("{{" + b + "}}" for b in bad))
    return out


async def list_templates(db: AsyncSession, *, q: str | None, category: str | None, status: str) -> list[MarketingTemplate]:
    await ensure_system_templates(db)
    stmt = select(MarketingTemplate).where(MarketingTemplate.status == status)
    if category:
        stmt = stmt.where(MarketingTemplate.category == category)
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(MarketingTemplate.name.ilike(like), MarketingTemplate.description.ilike(like), MarketingTemplate.subject.ilike(like)))
    return list((await db.execute(stmt.order_by(MarketingTemplate.is_system.desc(), MarketingTemplate.name))).scalars().all())


async def get(db: AsyncSession, template_id: uuid.UUID) -> MarketingTemplate:
    t = await db.get(MarketingTemplate, template_id)
    if t is None:
        raise NotFoundError("Template not found")
    return t


async def create(db: AsyncSession, user_id: uuid.UUID, data: dict[str, Any]) -> MarketingTemplate:
    t = MarketingTemplate(**{"category": "campaign", "blocks": [], **_validated({"name": "", **data})}, created_by=user_id)
    db.add(t)
    await db.flush()
    return t


async def update(db: AsyncSession, template_id: uuid.UUID, data: dict[str, Any]) -> MarketingTemplate:
    t = await get(db, template_id)
    if t.is_system:
        raise ValidationError("Starter templates can't be edited — duplicate it to make your own version")
    for k, v in _validated(data).items():
        setattr(t, k, v)
    await db.flush()
    return t


async def duplicate(db: AsyncSession, template_id: uuid.UUID, user_id: uuid.UUID) -> MarketingTemplate:
    src = await get(db, template_id)
    t = MarketingTemplate(name=f"{src.name} (copy)"[:160], category=src.category, description=src.description, subject=src.subject,
                          preheader=src.preheader, blocks=src.blocks, created_by=user_id)
    db.add(t)
    await db.flush()
    return t


async def set_archived(db: AsyncSession, template_id: uuid.UUID, archived: bool) -> MarketingTemplate:
    t = await get(db, template_id)
    if t.is_system and archived:
        raise ValidationError("Starter templates can't be archived")
    t.status = "archived" if archived else "active"
    await db.flush()
    return t
