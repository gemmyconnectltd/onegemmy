"""Click, open and unsubscribe tracking for marketing mail. Links are rewritten to signed redirects (a link can only
point where we put it — never an open redirect); opens use a 1×1 pixel, which email clients and privacy features can
block or pre-fetch, so opens are shown as approximate. Unsubscribing needs a confirming POST so a link scanner that
merely opens the URL cannot unsubscribe anyone."""
import re
import uuid
from datetime import UTC, datetime
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from jose import JWTError, jwt
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.marketing.models import MarketingContact, MarketingEvent, MarketingSend
from app.modules.tenants.models import Tenant

_CLICK_KEY = settings.SECRET_KEY + ":marketing-click"
_UNSUB_KEY = settings.SECRET_KEY + ":marketing-contact-unsub"
SITE_HOSTS = {"pesaa.io", "www.pesaa.io", "app.pesaa.io"}
_HREF_RE = re.compile(r'href="(https?://[^"]+)"')


def base_url() -> str:
    return f"{settings.API_PUBLIC_URL.rstrip('/')}/api/v1/global/m"


def click_token(send_id: uuid.UUID, url: str) -> str:
    return jwt.encode({"s": str(send_id), "u": url}, _CLICK_KEY, algorithm="HS256")


def read_click(token: str) -> tuple[uuid.UUID, str] | None:
    try:
        c = jwt.decode(token, _CLICK_KEY, algorithms=["HS256"], options={"verify_exp": False})
        url = c["u"]
        return uuid.UUID(c["s"]), url if urlsplit(url).scheme in ("http", "https") else ""
    except (JWTError, KeyError, ValueError):
        return None


def unsubscribe_token(contact_id: uuid.UUID, send_id: uuid.UUID | None) -> str:
    return jwt.encode({"c": str(contact_id), "s": str(send_id) if send_id else None}, _UNSUB_KEY, algorithm="HS256")


def read_unsubscribe(token: str) -> tuple[uuid.UUID, uuid.UUID | None] | None:
    try:
        c = jwt.decode(token, _UNSUB_KEY, algorithms=["HS256"], options={"verify_exp": False})
        return uuid.UUID(c["c"]), (uuid.UUID(c["s"]) if c.get("s") else None)
    except (JWTError, KeyError, ValueError):
        return None


def unsubscribe_url(contact_id: uuid.UUID, send_id: uuid.UUID | None) -> str:
    return f"{base_url()}/u/{unsubscribe_token(contact_id, send_id)}"


def tag_utm(url: str, campaign_slug: str) -> str:
    """Adds utm_* to links that go to Pesaa's own site/app, so Website Traffic can attribute the signups an email drives."""
    parts = urlsplit(url)
    if (parts.hostname or "").lower() not in SITE_HOSTS:
        return url
    q = dict(parse_qsl(parts.query, keep_blank_values=True))
    q.setdefault("utm_source", "pesaa-email")
    q.setdefault("utm_medium", "email")
    q.setdefault("utm_campaign", campaign_slug)
    return urlunsplit(parts._replace(query=urlencode(q)))


def instrument(html: str, send_id: uuid.UUID, campaign_slug: str) -> str:
    """Rewrites links to tracked redirects (unsubscribe links are left alone) and appends the open pixel."""
    def rewrite(m: re.Match[str]) -> str:
        url = m.group(1).replace("&amp;", "&")
        if "/global/m/u/" in url or url.startswith(base_url()):
            return m.group(0)
        return f'href="{base_url()}/c/{click_token(send_id, tag_utm(url, campaign_slug))}"'
    pixel = f'<img src="{base_url()}/o/{send_id}.gif" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;">'
    return _HREF_RE.sub(rewrite, html).replace("</body>", pixel + "</body>", 1)


async def record(db: AsyncSession, send_id: uuid.UUID, kind: str, url: str | None = None) -> None:
    """Counts an open/click on a send (never for a send that doesn't exist). Commits."""
    send = await db.get(MarketingSend, send_id)
    if send is None:
        return
    now = datetime.now(UTC)
    if kind == "open":
        send.opens, send.first_open_at = send.opens + 1, send.first_open_at or now
    elif kind == "click":
        send.clicks, send.first_click_at = send.clicks + 1, send.first_click_at or now
    db.add(MarketingEvent(send_id=send.id, campaign_id=send.campaign_id, automation_id=send.automation_id, kind=kind, url=(url or None) and url[:500]))
    await db.commit()


async def unsubscribe(db: AsyncSession, contact_id: uuid.UUID, send_id: uuid.UUID | None, reason: str = "Unsubscribed via email link") -> bool:
    contact = await db.get(MarketingContact, contact_id)
    if contact is None:
        return False
    now = datetime.now(UTC)
    if contact.status == "active":
        contact.status, contact.status_reason, contact.status_at = "unsubscribed", reason, now
    contact.newsletter_subscribed = False
    if contact.tenant_id:  # keep the per-business flag the support outreach already honours in step
        await db.execute(update(Tenant).where(Tenant.id == contact.tenant_id, Tenant.marketing_opt_out.is_(False)).values(marketing_opt_out=True, marketing_opt_out_at=now))
    if send_id and (send := await db.get(MarketingSend, send_id)) is not None and send.unsubscribed_at is None:
        send.unsubscribed_at = now
        db.add(MarketingEvent(send_id=send.id, campaign_id=send.campaign_id, automation_id=send.automation_id, kind="unsubscribe"))
    await db.commit()
    return True


async def contact_for_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> MarketingContact | None:
    return (await db.execute(select(MarketingContact).where(MarketingContact.tenant_id == tenant_id))).scalars().first()


