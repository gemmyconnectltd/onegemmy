"""Marketing settings: sender defaults, brand, compliance rules and the sending-domain DNS check. Provider credentials
stay in the server environment (SMTP_* / MARKETING_SMTP_*) and are never stored here or returned to the browser."""
import asyncio
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as env
from app.core.exceptions import ValidationError
from app.modules.marketing.models import MarketingSetting
from app.modules.marketing.render import DEFAULT_BRAND

DEFAULTS: dict[str, dict[str, Any]] = {
    "general": {"sender_name": "Pesaa", "sender_email": "", "reply_to": ""},
    "brand": {"color": DEFAULT_BRAND["color"], "logo_url": DEFAULT_BRAND["logo_url"], "company": "Pesaa", "address": ""},
    # opt_out: businesses can be emailed until they unsubscribe. opt_in: only contacts with recorded consent.
    "compliance": {"consent_mode": "opt_out", "footer_note": "You receive this email because your business uses Pesaa or asked to hear from us.",
                   "require_address": False},
}
SCHEMA: dict[str, dict[str, type]] = {
    "general": {"sender_name": str, "sender_email": str, "reply_to": str},
    "brand": {"color": str, "logo_url": str, "company": str, "address": str},
    "compliance": {"consent_mode": str, "footer_note": str, "require_address": bool},
}


async def get_all(db: AsyncSession) -> dict[str, dict[str, Any]]:
    rows = {r.key: r.value for r in (await db.execute(select(MarketingSetting))).scalars().all()}
    return {k: {**d, **(rows.get(k) or {})} for k, d in DEFAULTS.items()}


async def get_section(db: AsyncSession, key: str) -> dict[str, Any]:
    return (await get_all(db))[key]


def validate(section: str, value: dict[str, Any]) -> dict[str, Any]:
    if section not in SCHEMA:
        raise ValidationError("Unknown settings section")
    clean: dict[str, Any] = {}
    for k, typ in SCHEMA[section].items():
        if k not in value:
            continue
        v = value[k]
        clean[k] = bool(v) if typ is bool else str(v or "").strip()[:300]
    for k in ("sender_email", "reply_to"):
        if clean.get(k) and ("@" not in clean[k] or " " in clean[k]):
            raise ValidationError("Enter a valid email address")
    if section == "compliance" and clean.get("consent_mode") not in (None, "opt_in", "opt_out"):
        raise ValidationError("Consent mode must be opt_in or opt_out")
    if section == "brand" and clean.get("color") and not (len(clean["color"]) == 7 and clean["color"].startswith("#")):
        raise ValidationError("Brand colour must look like #16A34A")
    return clean


async def save_section(db: AsyncSession, section: str, value: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Returns (before, after) so the caller can audit exactly what changed. Does not commit."""
    clean = validate(section, value)
    before = (await get_all(db))[section]
    row = await db.get(MarketingSetting, section)
    after = {**before, **clean}
    if row is None:
        db.add(MarketingSetting(key=section, value=after))
    else:
        row.value = after
    return before, after


def _mask(value: str) -> str:
    if not value or "@" not in value:
        return value[:2] + "…" if value else ""
    local, domain = value.split("@", 1)
    return f"{local[:2]}…@{domain}"


def provider_status() -> dict[str, Any]:
    """Which mailbox marketing uses and whether it is configured — never the credentials."""
    user = env.MARKETING_SMTP_USER or env.SMTP_USER
    password = env.MARKETING_SMTP_PASSWORD or env.SMTP_PASSWORD
    return {"kind": "smtp", "host": env.SMTP_HOST, "port": env.SMTP_PORT, "account": _mask(user), "configured": bool(user and password),
            "from": env.MARKETING_EMAIL_FROM or env.EMAIL_FROM,
            "dedicated": bool(env.MARKETING_SMTP_USER and env.MARKETING_SMTP_PASSWORD)}


def outbound_configured() -> bool:
    return provider_status()["configured"]


def sender_domain(sender_email: str) -> str:
    email = sender_email or ""
    if "<" in email:
        email = email.split("<", 1)[1].rstrip(">")
    return email.rsplit("@", 1)[-1].strip().lower() if "@" in email else ""


_DKIM_SELECTORS = ("google", "selector1", "selector2", "default", "mail", "k1", "s1", "s2", "dkim")


def _txt(name: str) -> list[str] | None:
    import dns.exception
    import dns.resolver

    try:
        answers = dns.resolver.resolve(name, "TXT", lifetime=3.0)
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
        return []
    except (dns.exception.DNSException, OSError):
        return None  # could not be checked
    return ["".join(s.decode() for s in r.strings) for r in answers]


def _check_domain(domain: str) -> dict[str, Any]:
    out: dict[str, Any] = {"domain": domain, "spf": {"status": "unknown"}, "dkim": {"status": "unknown"}, "dmarc": {"status": "unknown"}}
    spf = _txt(domain)
    if spf is not None:
        rec = next((t for t in spf if t.lower().startswith("v=spf1")), None)
        out["spf"] = {"status": "pass" if rec else "missing", "record": rec}
    dmarc = _txt(f"_dmarc.{domain}")
    if dmarc is not None:
        rec = next((t for t in dmarc if t.lower().startswith("v=dmarc1")), None)
        out["dmarc"] = {"status": "pass" if rec else "missing", "record": rec}
    checked, found = 0, None
    for sel in _DKIM_SELECTORS:
        res = _txt(f"{sel}._domainkey.{domain}")
        if res is None:
            continue
        checked += 1
        if res:
            found = sel
            break
    out["dkim"] = {"status": "pass" if found else ("missing" if checked else "unknown"), "selector": found,
                   "note": None if found else "Only common selectors are checked; your provider may use a custom one."}
    return out


async def domain_status(domain: str) -> dict[str, Any]:
    if not domain:
        raise ValidationError("Set a sender email first")
    return await asyncio.to_thread(_check_domain, domain)
