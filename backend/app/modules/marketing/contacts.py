"""Contacts: the marketing view of businesses and imported leads, with consent, suppression, tags, segments and import.

Rules that apply to every send (campaign, newsletter or automation) live in `eligibility`:
- suppressed contacts (unsubscribed, bounced, complained, invalid) and invalid / test-domain addresses are never emailed;
- a business that unsubscribed through the old per-business flag stays unsubscribed here;
- consent is recorded, never assumed: imported leads always need recorded consent, businesses follow the consent mode
  chosen in Settings → Compliance, and newsletters additionally need an explicit newsletter subscription."""
import csv
import io
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import and_, exists, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as env
from app.core.exceptions import ValidationError
from app.modules.marketing.models import MarketingContact
from app.modules.tenants.models import Tenant, User
from app.modules.traffic.models import ErpActivity

MAX_IMPORT_ROWS = 5000
MAX_IMPORT_BYTES = 2_000_000
MAX_BULK = 5000
TEST_DOMAINS = {"prodcopy.test", "example.com", "example.org", "example.net", "localhost"}
TEST_TLDS = (".test", ".invalid", ".example", ".localhost", ".local")
STATUSES = ("active", "unsubscribed", "bounced", "complained", "invalid")


def check_email(raw: str) -> tuple[str, str | None]:
    """(normalised address, reason it can't receive marketing or None)."""
    email = (raw or "").strip().lower()
    if not email:
        return "", "Missing email"
    try:
        email = validate_email(email, check_deliverability=False).normalized.lower()
    except EmailNotValidError:
        return email[:255], "Invalid email address"
    domain = email.rsplit("@", 1)[-1]
    if domain in TEST_DOMAINS or domain.endswith(TEST_TLDS):
        return email, "Test or placeholder domain"
    return email, None


def safe_recipients() -> set[str]:
    return {e.strip().lower() for e in env.MARKETING_TEST_RECIPIENTS.split(",") if e.strip()}


# ── Filters → SQL ─────────────────────────────────────────────────────────────

def _list(v: Any) -> list[str]:
    return [str(x) for x in v] if isinstance(v, list) else ([str(v)] if v else [])


def _date(v: Any) -> datetime | None:
    try:
        return datetime.fromisoformat(str(v)).replace(tzinfo=UTC) if v else None
    except ValueError:
        raise ValidationError("Dates must look like 2026-01-31") from None


def filter_conditions(f: dict[str, Any]) -> list[Any]:
    """Segment definition → WHERE conditions over MarketingContact (outer-joined with Tenant)."""
    c: list[Any] = []
    if q := str(f.get("q") or "").strip():
        like = f"%{q}%"
        c.append(or_(MarketingContact.email.ilike(like), MarketingContact.name.ilike(like), MarketingContact.business_name.ilike(like),
                     MarketingContact.phone.ilike(like)))
    if v := _list(f.get("countries")):
        c.append(MarketingContact.country.in_(v))
    if v := _list(f.get("plans")):
        c.append(Tenant.subscription_plan.in_(v))
    if v := _list(f.get("industries")):
        c.append(Tenant.industry.in_(v))
    if v := _list(f.get("sources")):
        c.append(MarketingContact.source.in_(v))
    if v := _list(f.get("tags")):
        c.append(or_(*[MarketingContact.tags.contains([t]) for t in v]))
    if v := f.get("account_status"):
        if v == "active":
            c.append(Tenant.is_active.is_(True))
        elif v == "suspended":
            c.append(Tenant.is_active.is_(False))
    if v := f.get("preferred_contact"):
        c.append(Tenant.preferred_contact == v)
    if v := f.get("consent"):
        c.append(MarketingContact.consent == v)
    if f.get("newsletter") is True:
        c.append(MarketingContact.newsletter_subscribed.is_(True))
    elif f.get("newsletter") is False:
        c.append(MarketingContact.newsletter_subscribed.is_(False))
    if v := f.get("status"):
        c.append(MarketingContact.status == v)
    reg = func.coalesce(Tenant.created_at, MarketingContact.created_at)
    if d := _date(f.get("registered_from")):
        c.append(reg >= d)
    if d := _date(f.get("registered_to")):
        c.append(reg < d + timedelta(days=1))
    if v := f.get("activity"):
        recent = exists().where(ErpActivity.tenant_id == Tenant.id, ErpActivity.created_at >= datetime.now(UTC) - timedelta(days=30))
        ever = exists().where(ErpActivity.tenant_id == Tenant.id)
        c.append({"active_30d": recent, "inactive_30d": and_(ever, ~recent), "never": ~ever}.get(v, True))
    return c


def contact_select(*cols: Any) -> Any:
    return select(*cols).select_from(MarketingContact).outerjoin(Tenant, Tenant.id == MarketingContact.tenant_id)


def eligibility(consent_mode: str, *, newsletter: bool = False) -> list[Any]:
    conds: list[Any] = [
        MarketingContact.status == "active", MarketingContact.email_valid.is_(True),
        or_(MarketingContact.tenant_id.is_(None), and_(Tenant.marketing_opt_out.is_(False), Tenant.archived_at.is_(None), Tenant.is_active.is_(True))),
    ]
    if consent_mode == "opt_in":
        conds.append(MarketingContact.consent == "subscribed")
    else:  # opt_out: businesses are reachable until they unsubscribe, but imported leads always need recorded consent
        conds.append(or_(MarketingContact.tenant_id.isnot(None), MarketingContact.consent == "subscribed"))
    if newsletter:
        conds.append(MarketingContact.newsletter_subscribed.is_(True))
    return conds


async def audience_summary(db: AsyncSession, filters: dict[str, Any], consent_mode: str, *, newsletter: bool = False) -> dict[str, Any]:
    """How many contacts match the filters, how many can actually be emailed, and why the rest cannot."""
    elig = and_(*eligibility(consent_mode, newsletter=newsletter))
    tenant_blocked = and_(MarketingContact.tenant_id.isnot(None), or_(Tenant.marketing_opt_out.is_(True), Tenant.archived_at.isnot(None)))
    row = (await db.execute(contact_select(
        func.count(), func.count().filter(elig),
        func.count().filter(or_(MarketingContact.status == "unsubscribed", and_(MarketingContact.status == "active", tenant_blocked))),
        func.count().filter(MarketingContact.status.in_(("bounced", "complained"))),
        func.count().filter(or_(MarketingContact.status == "invalid", MarketingContact.email_valid.is_(False))),
        func.count().filter(and_(MarketingContact.tenant_id.isnot(None), Tenant.is_active.is_(False), Tenant.marketing_opt_out.is_(False))),
        func.count().filter(and_(MarketingContact.status == "active", MarketingContact.email_valid.is_(True), MarketingContact.consent != "subscribed",
                                 *( [] if consent_mode == "opt_in" else [MarketingContact.tenant_id.is_(None)] ))),
        func.count().filter(and_(MarketingContact.status == "active", MarketingContact.email_valid.is_(True), MarketingContact.newsletter_subscribed.is_(False))) if newsletter else func.count().filter(False),
    ).where(*filter_conditions(filters)))).one()
    return {"matched": row[0], "eligible": row[1], "excluded": {
        "unsubscribed": row[2], "bounced_or_complained": row[3], "invalid_email": row[4], "suspended_account": row[5],
        "no_consent": row[6], "not_newsletter_subscriber": row[7]}, "consentMode": consent_mode}


# ── Syncing businesses into contacts ──────────────────────────────────────────

async def sync_tenant_contacts(db: AsyncSession) -> int:
    """Keeps one contact per business (its earliest active owner) up to date. Business data always wins; consent, tags and
    suppression set in the Hub are never overwritten, and a business that unsubscribed stays unsubscribed. Does not commit."""
    owner = (select(User.tenant_id, User.full_name, User.email).where(User.role == "owner", User.is_active.is_(True), User.tenant_id.isnot(None))
             .distinct(User.tenant_id).order_by(User.tenant_id, User.created_at).subquery())
    rows = (await db.execute(select(Tenant.id, Tenant.name, Tenant.phone, Tenant.country, Tenant.marketing_opt_out, owner.c.full_name, owner.c.email)
                             .join(owner, owner.c.tenant_id == Tenant.id).where(Tenant.archived_at.is_(None)))).all()
    now, n = datetime.now(UTC), 0
    existing = {c.tenant_id: c for c in (await db.execute(select(MarketingContact).where(MarketingContact.tenant_id.isnot(None)))).scalars().all()}
    by_email = {c.email: c for c in (await db.execute(select(MarketingContact).where(MarketingContact.tenant_id.is_(None)))).scalars().all()}
    for tid, name, phone, country, opted_out, owner_name, email_raw in rows:
        email, bad = check_email(email_raw)
        contact = existing.get(tid) or by_email.pop(email, None)
        if contact is None:
            contact = MarketingContact(email=email, source="tenant", tenant_id=tid)
            db.add(contact)
            n += 1
        contact.tenant_id, contact.business_name, contact.name, contact.phone, contact.country = tid, name, owner_name, phone, country
        if contact.email != email and email not in {c.email for c in existing.values()}:
            contact.email = email
        contact.email_valid, contact.invalid_reason = bad is None, bad
        if opted_out and contact.status == "active":
            contact.status, contact.status_reason, contact.status_at = "unsubscribed", "Unsubscribed", now
    await db.flush()
    return n


async def import_preview_or_run(db: AsyncSession, csv_text: str, *, consent_source: str, tags: list[str], dry_run: bool) -> dict[str, Any]:
    if len(csv_text.encode()) > MAX_IMPORT_BYTES:
        raise ValidationError("That file is too large — import at most 2 MB at a time")
    reader = csv.DictReader(io.StringIO(csv_text.lstrip("﻿")))
    cols = {(h or "").strip().lower(): h for h in (reader.fieldnames or [])}
    if "email" not in cols:
        raise ValidationError("The file needs a header row with an “email” column")
    pick = lambda row, *names: next((str(row[cols[n]]).strip() for n in names if n in cols and row.get(cols[n])), "")
    rows = list(reader)
    if len(rows) > MAX_IMPORT_ROWS:
        raise ValidationError(f"Import at most {MAX_IMPORT_ROWS:,} rows at a time")
    emails = {check_email(pick(r, "email"))[0] for r in rows}
    known = {e: s for e, s in (await db.execute(select(MarketingContact.email, MarketingContact.status).where(MarketingContact.email.in_(emails)))).all()}
    seen: set[str] = set()
    problems: list[dict[str, Any]] = []
    good: list[dict[str, Any]] = []
    counts = {"rows": len(rows), "new": 0, "invalid": 0, "duplicate_in_file": 0, "already_exists": 0, "suppressed": 0}
    for i, r in enumerate(rows, start=2):
        email, bad = check_email(pick(r, "email"))
        reason = bad
        if not reason and email in seen:
            reason, key = "Duplicate in this file", "duplicate_in_file"
        elif not reason and email in known:
            reason, key = ("Already in your contacts (suppressed — not re-subscribed)", "suppressed") if known[email] != "active" else ("Already in your contacts", "already_exists")
        else:
            key = "invalid"
        if reason:
            counts[key] += 1
            if len(problems) < 50:
                problems.append({"row": i, "email": email, "reason": reason})
            continue
        seen.add(email)
        good.append({"email": email, "name": pick(r, "name", "full_name", "contact")[:255] or None, "business_name": pick(r, "business", "company", "business_name")[:255] or None,
                     "phone": pick(r, "phone")[:50] or None, "country": pick(r, "country")[:100] or None,
                     "tags": sorted({*tags, *[t.strip()[:40] for t in pick(r, "tags").split(";") if t.strip()]})})
    counts["new"] = len(good)
    if not dry_run and good:
        now = datetime.now(UTC)
        for i in range(0, len(good), 500):
            await db.execute(pg_insert(MarketingContact).values([{**g, "source": "import", "status": "active", "consent": "subscribed",
                                                                   "consent_source": consent_source, "consent_at": now, "email_valid": True} for g in good[i:i + 500]])
                             .on_conflict_do_nothing(index_elements=["email"]))
    return {**counts, "problems": problems, "dryRun": dry_run}


# ── Bulk actions ──────────────────────────────────────────────────────────────

async def bulk_apply(db: AsyncSession, ids: list[uuid.UUID], action: str, *, tags: list[str] | None = None, consent_source: str | None = None,
                     reason: str | None = None) -> int:
    """Applies one action to many contacts; returns how many changed. Does not commit."""
    if not ids or len(ids) > MAX_BULK:
        raise ValidationError(f"Choose between 1 and {MAX_BULK:,} contacts")
    contacts = (await db.execute(select(MarketingContact).where(MarketingContact.id.in_(ids)))).scalars().all()
    now, changed = datetime.now(UTC), 0
    tags = sorted({t.strip()[:40] for t in (tags or []) if t.strip()})
    if action in ("add_tags", "remove_tags") and not tags:
        raise ValidationError("Enter at least one tag")
    if action == "consent" and not (consent_source or "").strip():
        raise ValidationError("Say where consent was given (for example “Signed up on the website”)")
    for c in contacts:
        before = (c.status, c.consent, c.newsletter_subscribed, tuple(c.tags or []))
        if action == "add_tags":
            c.tags = sorted({*(c.tags or []), *tags})
        elif action == "remove_tags":
            c.tags = [t for t in (c.tags or []) if t not in tags]
        elif action == "consent":
            c.consent, c.consent_source, c.consent_at = "subscribed", consent_source.strip()[:100], now
        elif action == "newsletter_on":
            if c.status == "active":
                c.newsletter_subscribed, c.newsletter_at = True, now
                if c.consent != "subscribed":
                    c.consent, c.consent_source, c.consent_at = "subscribed", (consent_source or "Subscribed by an admin")[:100], now
        elif action == "newsletter_off":
            c.newsletter_subscribed = False
        elif action == "suppress":
            c.status, c.status_reason, c.status_at, c.newsletter_subscribed = "unsubscribed", (reason or "Suppressed by an admin")[:200], now, False
            if c.tenant_id:
                await db.execute(update(Tenant).where(Tenant.id == c.tenant_id).values(marketing_opt_out=True, marketing_opt_out_at=now))
        elif action == "reactivate":
            if c.status in ("unsubscribed", "bounced", "complained", "invalid") and c.email_valid:
                c.status, c.status_reason, c.status_at = "active", (reason or "Reactivated by an admin")[:200], now
                if c.tenant_id:
                    await db.execute(update(Tenant).where(Tenant.id == c.tenant_id).values(marketing_opt_out=False, marketing_opt_out_at=None))
        elif action == "delete":
            if c.source == "tenant":
                continue  # businesses are removed with the business, never from here
            await db.delete(c)
            changed += 1
            continue
        else:
            raise ValidationError("Unknown action")
        if before != (c.status, c.consent, c.newsletter_subscribed, tuple(c.tags or [])):
            changed += 1
    await db.flush()
    return changed


