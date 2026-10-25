"""Pure helpers that turn a raw page view (path, referrer, UTM tags) into stored, bounded values."""
import re
from urllib.parse import urlsplit

CHANNELS = ("organic", "direct", "social", "referral", "paid", "other")

VISITOR_ID_RE = re.compile(r"^[A-Za-z0-9-]{16,64}$")
_BOT_RE = re.compile(r"bot|crawl|spider|slurp|headless|lighthouse|preview|monitor|curl|python-requests", re.IGNORECASE)

_SEARCH = ("google.", "bing.", "duckduckgo.", "yahoo.", "baidu.", "yandex.", "ecosia.", "startpage.", "brave.")
_SOCIAL = (
    "facebook.", "fb.com", "fb.me", "instagram.", "twitter.", "t.co", "x.com", "linkedin.", "lnkd.in",
    "youtube.", "youtu.be", "tiktok.", "whatsapp.", "wa.me", "pinterest.", "reddit.", "telegram.", "t.me",
)
_PAID_MEDIUMS = {"cpc", "ppc", "paid", "paidsearch", "paid-search", "paidsocial", "paid-social", "display", "ads", "ad"}
_SOCIAL_MEDIUMS = {"social", "social-media", "socialmedia", "sm"}


def is_bot(user_agent: str | None) -> bool:
    return not user_agent or bool(_BOT_RE.search(user_agent))


def clean_path(raw: str) -> str | None:
    """Path only — never the query string or fragment, which may carry tokens or personal data."""
    path = raw.split("?", 1)[0].split("#", 1)[0].strip()
    if not path.startswith("/") or path.startswith("//") or len(path) > 200:
        return None
    return path.rstrip("/") or "/"


def clean_tag(value: str | None) -> str | None:
    value = (value or "").strip().lower()[:100]
    return value or None


def referrer_host(referrer: str | None, own_hosts: set[str]) -> str | None:
    """Host of an external referrer; None for no referrer or a visit coming from the site itself."""
    if not referrer:
        return None
    host = (urlsplit(referrer).hostname or "").lower().removeprefix("www.")[:120]
    if not host or host in own_hosts:
        return None
    return host


def classify_channel(host: str | None, medium: str | None, source: str | None) -> str:
    if medium in _PAID_MEDIUMS:
        return "paid"
    if medium in _SOCIAL_MEDIUMS:
        return "social"
    if host:
        if any(host.startswith(s) or f".{s}" in f".{host}" for s in _SEARCH):
            return "organic"
        if any(host == s or host.startswith(s) or f".{s}" in f".{host}" for s in _SOCIAL):
            return "social"
        return "referral"
    if medium or source:
        return "other"
    return "direct"


# First path segment of the signed-in app → the module it belongs to (anything else is "other").
ERP_MODULES = {
    "dashboard": "dashboard", "sales": "sales", "customers": "customers", "crm": "customers", "inventory": "inventory",
    "products": "inventory", "procurement": "purchases", "expenses": "expenses", "debts": "debts",
    "accounting": "accounting", "reports": "reports", "hr": "hr", "manufacturing": "manufacturing",
    "services": "services", "repairs": "services", "branches": "branches", "settings": "settings",
    "support": "support", "profile": "profile", "pos": "pos",
}


def erp_module(path: str) -> str:
    return ERP_MODULES.get(path.strip("/").split("/", 1)[0], "other")


# ── Device, OS and browser from the User-Agent header (only the coarse labels are stored, never the raw string) ──

def device_type(ua: str) -> str:
    ua = ua.lower()
    if "ipad" in ua or "tablet" in ua or ("android" in ua and "mobile" not in ua):
        return "tablet"
    if "iphone" in ua or "ipod" in ua or "mobi" in ua or "android" in ua:
        return "mobile"
    return "desktop"


def os_name(ua: str) -> str:
    ua = ua.lower()
    for needle, name in (("iphone", "iOS"), ("ipad", "iOS"), ("ipod", "iOS"), ("android", "Android"), ("windows", "Windows"),
                         ("cros", "ChromeOS"), ("mac os x", "macOS"), ("macintosh", "macOS"), ("linux", "Linux")):
        if needle in ua:
            return name
    return "Other"


def browser_name(ua: str) -> str:
    ua = ua.lower()
    if "; wv)" in ua or "webview" in ua:
        return "In-app browser"
    for needle, name in (("edg/", "Edge"), ("edga/", "Edge"), ("edgios/", "Edge"), ("opr/", "Opera"), ("opera", "Opera"),
                         ("samsungbrowser", "Samsung Internet"), ("firefox/", "Firefox"), ("fxios", "Firefox"),
                         ("chrome/", "Chrome"), ("crios", "Chrome")):
        if needle in ua:
            return name
    return "Safari" if "safari/" in ua else "Other"
