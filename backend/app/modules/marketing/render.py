"""Email builder rendering: content blocks → email-client-safe HTML (tables, inline styles, 600px, a mobile media
query) plus a plain-text alternative. One renderer serves previews, test sends and live sends, so what an admin sees is
what recipients get. Per-recipient `{{variables}}` are left in place here and filled by `personalize`."""
import html
import re
from typing import Any
from urllib.parse import urlsplit

from app.core.exceptions import ValidationError

VARIABLES = ("first_name", "name", "business_name", "email", "plan", "country", "unsubscribe_url")
BLOCK_TYPES = ("header", "heading", "paragraph", "image", "button", "divider", "spacer", "columns", "social", "footer")
NETWORKS = ("website", "facebook", "x", "linkedin", "instagram", "youtube", "whatsapp")
MAX_BLOCKS = 60
LOGO_URL = "https://pesaa.io/icons/icon-192x192.png"
DEFAULT_BRAND = {"color": "#16A34A", "name": "Pesaa", "logo_url": LOGO_URL}

_VAR_RE = re.compile(r"\{\{\s*([a-z_]+)\s*\}\}")
_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
_LINK_RE = re.compile(r"\[([^\]\n]{1,100})\]\((https?://[^\s)]{1,500})\)")
_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
ALIGNS = ("left", "center", "right")


def safe_url(value: Any, *, allow_mailto: bool = False, allow_var: bool = False) -> str:
    url = str(value or "").strip()[:500]
    if not url:
        return ""
    if allow_var and url == "{{unsubscribe_url}}":
        return url
    scheme = urlsplit(url).scheme.lower()
    if scheme in ("http", "https") and urlsplit(url).netloc:
        return url
    if allow_mailto and scheme == "mailto":
        return url
    raise ValidationError(f"“{url[:60]}” isn't a valid link — use a full http(s):// address")


def _text(value: Any, limit: int) -> str:
    return str(value or "").replace("\r", "")[:limit]


def _align(value: Any) -> str:
    return value if value in ALIGNS else "left"


def clean_blocks(blocks: Any) -> list[dict[str, Any]]:
    """Validates and normalises blocks coming from the editor. Unknown types, oversized text and unsafe links are
    rejected, so stored content can always be rendered."""
    if not isinstance(blocks, list):
        raise ValidationError("Email content must be a list of blocks")
    if len(blocks) > MAX_BLOCKS:
        raise ValidationError(f"An email can have at most {MAX_BLOCKS} blocks")
    out: list[dict[str, Any]] = []
    for i, b in enumerate(blocks):
        if not isinstance(b, dict) or b.get("type") not in BLOCK_TYPES:
            raise ValidationError("An email block has an unknown type")
        kind, p = b["type"], (b.get("props") or {})
        props: dict[str, Any]
        if kind == "header":
            props = {"tagline": _text(p.get("tagline"), 120)}
        elif kind == "heading":
            props = {"text": _text(p.get("text"), 200), "level": p.get("level") if p.get("level") in (1, 2, 3) else 2, "align": _align(p.get("align"))}
        elif kind == "paragraph":
            props = {"text": _text(p.get("text"), 5000), "align": _align(p.get("align"))}
        elif kind == "image":
            props = {"url": safe_url(p.get("url")), "alt": _text(p.get("alt"), 160), "link": safe_url(p.get("link")), "full": bool(p.get("full", True))}
        elif kind == "button":
            props = {"label": _text(p.get("label"), 60), "url": safe_url(p.get("url"), allow_var=True), "align": _align(p.get("align") or "center")}
        elif kind == "divider":
            props = {}
        elif kind == "spacer":
            props = {"height": min(max(int(p.get("height") or 24), 8), 96)}
        elif kind == "columns":
            items = [{"title": _text(c.get("title"), 100), "text": _text(c.get("text"), 600), "image": safe_url(c.get("image")),
                      "label": _text(c.get("label"), 40), "url": safe_url(c.get("url"))} for c in (p.get("items") or [])[:3] if isinstance(c, dict)]
            props = {"items": items}
        elif kind == "social":
            links = [{"network": s.get("network") if s.get("network") in NETWORKS else "website", "url": safe_url(s.get("url"), allow_mailto=False)}
                     for s in (p.get("links") or [])[:7] if isinstance(s, dict) and s.get("url")]
            props = {"links": links}
        else:  # footer: free text shown above the compliance footer that is always appended
            props = {"text": _text(p.get("text"), 600)}
        out.append({"id": str(b.get("id") or f"b{i}")[:40], "type": kind, "props": props})
    return out


def unknown_variables(*texts: str) -> list[str]:
    found = {m for t in texts for m in _VAR_RE.findall(t or "")}
    return sorted(found - set(VARIABLES))


def blocks_text(blocks: list[dict[str, Any]]) -> str:
    return "\n".join(
        str(v) for b in blocks for v in (b.get("props") or {}).values() if isinstance(v, str)
    ) + "\n".join(str(c.get(k, "")) for b in blocks if b.get("type") == "columns" for c in b["props"].get("items", []) for k in ("title", "text"))


def _inline(text: str, color: str) -> str:
    """Escape first, then allow only **bold**, [label](https://url) and line breaks."""
    out = html.escape(text, quote=False)
    out = _LINK_RE.sub(lambda m: f'<a href="{html.escape(m.group(2), quote=True)}" style="color:{color};text-decoration:underline;">{m.group(1)}</a>', out)
    out = _BOLD_RE.sub(r"<strong>\1</strong>", out)
    return out.replace("\n", "<br>")


def _plain(text: str) -> str:
    return _BOLD_RE.sub(r"\1", _LINK_RE.sub(lambda m: f"{m.group(1)} ({m.group(2)})", text))


def _wrap(inner: str, pad: str = "0 32px") -> str:
    return f'<tr><td style="padding:{pad};">{inner}</td></tr>'


def _block_html(b: dict[str, Any], brand: dict[str, str]) -> tuple[str, str]:
    color, p = brand["color"], b["props"]
    t = b["type"]
    if t == "header":
        tagline = f'<div style="font-size:13px;color:#64748b;margin-top:6px;">{html.escape(p.get("tagline") or "")}</div>' if p.get("tagline") else ""
        logo = f'<img src="{html.escape(brand["logo_url"], quote=True)}" width="40" height="40" alt="{html.escape(brand["name"])}" style="display:inline-block;vertical-align:middle;border-radius:8px;border:0;">'
        name = f'<span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:22px;font-weight:700;color:#0f172a;">{html.escape(brand["name"])}</span>'
        return (f'<tr><td align="center" style="padding:28px 32px 8px;">{logo}{name}{tagline}</td></tr>',
                f'{brand["name"]}\n' + (p.get("tagline") or ""))
    if t == "heading":
        size = {1: 28, 2: 22, 3: 18}[p["level"]]
        return (_wrap(f'<h{p["level"]} style="margin:20px 0 8px;font-size:{size}px;line-height:1.25;color:#0f172a;text-align:{p["align"]};">{_inline(p["text"], color)}</h{p["level"]}>'),
                p["text"])
    if t == "paragraph":
        return (_wrap(f'<p style="margin:8px 0;font-size:15px;line-height:1.65;color:#334155;text-align:{p["align"]};">{_inline(p["text"], color)}</p>'), _plain(p["text"]))
    if t == "image":
        if not p["url"]:
            return "", ""
        width = 'width="536" style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:8px;"' if p["full"] else 'style="display:block;max-width:100%;height:auto;border:0;margin:0 auto;"'
        img = f'<img src="{html.escape(p["url"], quote=True)}" alt="{html.escape(p["alt"])}" {width}>'
        if p["link"]:
            img = f'<a href="{html.escape(p["link"], quote=True)}" style="text-decoration:none;">{img}</a>'
        return _wrap(f'<div style="margin:12px 0;">{img}</div>'), (p["alt"] or "")
    if t == "button":
        if not p["label"] or not p["url"]:
            return "", ""
        btn = (f'<a href="{html.escape(p["url"], quote=True)}" style="display:inline-block;background:{color};color:#ffffff;font-size:15px;font-weight:600;'
               f'text-decoration:none;padding:12px 24px;border-radius:8px;">{html.escape(p["label"])}</a>')
        return _wrap(f'<div style="margin:16px 0;text-align:{p["align"]};">{btn}</div>'), f'{p["label"]}: {p["url"]}'
    if t == "divider":
        return _wrap('<hr style="border:0;border-top:1px solid #e2e8f0;margin:16px 0;">'), "----------"
    if t == "spacer":
        return f'<tr><td style="height:{p["height"]}px;line-height:{p["height"]}px;font-size:1px;">&nbsp;</td></tr>', ""
    if t == "columns":
        items = p["items"]
        if not items:
            return "", ""
        width = 100 // len(items)
        cells = ""
        for c in items:
            img = f'<img src="{html.escape(c["image"], quote=True)}" alt="" width="100%" style="display:block;width:100%;height:auto;border:0;border-radius:8px;margin-bottom:8px;">' if c["image"] else ""
            ttl = f'<div style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:4px;">{_inline(c["title"], color)}</div>' if c["title"] else ""
            txt = f'<div style="font-size:14px;line-height:1.6;color:#334155;">{_inline(c["text"], color)}</div>' if c["text"] else ""
            link = f'<div style="margin-top:8px;"><a href="{html.escape(c["url"], quote=True)}" style="color:{color};font-weight:600;font-size:14px;">{html.escape(c["label"] or "Learn more")} →</a></div>' if c["url"] else ""
            cells += f'<td class="col" width="{width}%" valign="top" style="padding:8px;">{img}{ttl}{txt}{link}</td>'
        return (_wrap(f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>{cells}</tr></table>', "8px 24px"),
                "\n\n".join(f'{c["title"]}\n{_plain(c["text"])}' for c in items))
    if t == "social":
        links = p["links"]
        if not links:
            return "", ""
        label = {"website": "Website", "facebook": "Facebook", "x": "X", "linkedin": "LinkedIn", "instagram": "Instagram", "youtube": "YouTube", "whatsapp": "WhatsApp"}
        anchors = " &nbsp;·&nbsp; ".join(f'<a href="{html.escape(s["url"], quote=True)}" style="color:{color};font-size:14px;font-weight:600;text-decoration:none;">{label[s["network"]]}</a>' for s in links)
        return _wrap(f'<div style="margin:16px 0;text-align:center;">{anchors}</div>'), " | ".join(f'{label[s["network"]]}: {s["url"]}' for s in links)
    # footer text (the compliance footer is appended separately)
    if p.get("text"):
        return _wrap(f'<p style="margin:12px 0;font-size:13px;line-height:1.6;color:#64748b;text-align:center;">{_inline(p["text"], color)}</p>'), _plain(p["text"])
    return "", ""


def render_email(blocks: list[dict[str, Any]], *, subject: str = "", preheader: str = "", brand: dict[str, str] | None = None,
                 company: str = "Pesaa", address: str = "", footer_note: str = "") -> tuple[str, str]:
    """Returns (html, plain_text). `{{unsubscribe_url}}` and other variables are still placeholders."""
    brand = {**DEFAULT_BRAND, **(brand or {})}
    if not _COLOR_RE.match(brand["color"]):
        brand["color"] = DEFAULT_BRAND["color"]
    rows, texts = [], []
    for b in blocks:
        h, t = _block_html(b, brand)
        if h:
            rows.append(h)
        if t:
            texts.append(t)
    note = footer_note or "You receive this email because your business uses Pesaa or asked to hear from us."
    addr = f'<br>{html.escape(address)}' if address else ""
    compliance = (f'<tr><td style="padding:16px 32px 28px;text-align:center;font-size:12px;line-height:1.6;color:#94a3b8;">'
                  f'{html.escape(note)}<br>{html.escape(company)}{addr}<br>'
                  f'<a href="{{{{unsubscribe_url}}}}" style="color:#94a3b8;text-decoration:underline;">Unsubscribe</a></td></tr>')
    hidden = (f'<div style="display:none;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">{html.escape(preheader)}</div>' if preheader else "")
    doc = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>{html.escape(subject)}</title>
<style>@media only screen and (max-width:620px){{.container{{width:100%!important}}.col{{display:block!important;width:100%!important}}}}</style></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">{hidden}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:12px;">
{''.join(rows)}{compliance}</table></td></tr></table></body></html>"""
    text = "\n\n".join(texts) + f"\n\n--\n{note}\n{company}" + (f"\n{address}" if address else "") + "\nUnsubscribe: {{unsubscribe_url}}\n"
    return doc, text


def personalize(content: str, values: dict[str, str], *, html_mode: bool) -> str:
    """Fills `{{variable}}` placeholders; values are escaped for HTML. Unknown variables become empty."""
    def fill(m: re.Match[str]) -> str:
        v = values.get(m.group(1), "")
        return html.escape(v, quote=True) if html_mode and m.group(1) != "unsubscribe_url" else v
    return _VAR_RE.sub(fill, content)


def sample_values() -> dict[str, str]:
    return {"first_name": "Amina", "name": "Amina Uwase", "business_name": "Amina's Pharmacy", "email": "amina@example.com", "plan": "Starter",
            "country": "Rwanda", "unsubscribe_url": "#unsubscribe"}
