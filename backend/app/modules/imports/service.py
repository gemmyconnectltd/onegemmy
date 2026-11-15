"""The import engine behind Upload -> Review & Fix -> Import.

Nothing here writes business records. Rows are staged and corrected in the browser and only become records through
each module's own bulk endpoint, after the person approves them, so every module keeps its permissions, validation,
stock and accounting rules. This module only helps the review:
  * check(): compares staged rows with what the business already has (duplicates) and resolves names to records
    (a product's category, brand and unit), always within the person's own business;
  * sheet_picture_previews(): small previews of the pictures pasted into an Excel sheet, by sheet row;
  * extract(): reads a photographed or PDF record with Pesaa AI, word for word, marking values it is unsure of;
  * suggest_mapping(): asks Pesaa AI which field an unrecognised column heading holds (a suggestion the person confirms).
"""
from __future__ import annotations

import base64
import io
import json
import re
import time
import uuid
from decimal import Decimal
from typing import Any

from PIL import Image as PilImage
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ValidationError
from app.modules.ai.models import AiUsageEvent
from app.modules.ai.providers import OpenAIProvider, ProviderError, get_provider
from app.modules.ai.service import (
    AIDisabledError,
    AILimitError,
    AIUnavailableError,
    _check_rate,
    get_ai_settings,
    monthly_limit,
    used_this_month,
)

MODULES = ("products", "customers", "suppliers", "expenses", "sales", "accounts")
MAX_ROWS = 5000
MAX_SOURCE_BYTES = 12 * 1024 * 1024
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}


def _issue(column: str, message: str, summary: str, level: str = "error") -> dict[str, str]:
    return {"column": column, "message": message, "summary": summary, "level": level}


def _text(row: dict[str, Any], key: str) -> str:
    return str(row.get(key) or "").strip()


def phone_key(value: str) -> str:
    """The comparable part of a phone number: its last 9 digits, so +250 788 123 456, 0788123456 and 788-123-456 match."""
    digits = re.sub(r"\D", "", value or "")
    return digits[-9:] if len(digits) >= 7 else ""


async def _lower_in(db: AsyncSession, model, column, tenant_id: uuid.UUID, values: set[str], *extra):
    if not values:
        return []
    return (await db.execute(select(column, *extra).where(model.tenant_id == tenant_id, func.lower(column).in_(values)))).all()


# ── duplicates and lookups ────────────────────────────────────────────────────

async def check(db: AsyncSession, tenant_id: uuid.UUID, module: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """One result per row: {duplicate: why it would duplicate an existing record or None, issues: [...], context: {...}}.
    `context` carries resolved ids (e.g. _category_id) that the module's own import then uses."""
    if module not in MODULES:
        raise ValidationError("Unknown import type")
    if len(rows) > MAX_ROWS:
        raise ValidationError(f"Import up to {MAX_ROWS} rows at a time")
    results: list[dict[str, Any]] = [{"duplicate": None, "issues": [], "context": {}} for _ in rows]
    handler = {"products": _check_products, "customers": _check_customers, "suppliers": _check_suppliers,
               "sales": _check_sales, "accounts": _check_accounts}.get(module)
    if handler:
        await handler(db, tenant_id, rows, results)
    return results


async def _check_products(db, tenant_id, rows, results) -> None:
    from app.modules.inventory.models.brand import Brand
    from app.modules.inventory.models.category import Category
    from app.modules.inventory.models.product import Product
    from app.modules.inventory.models.unit import Unit

    want = {k: {_text(r, k).lower() for r in rows if _text(r, k)} for k in ("sku", "barcode", "name", "category", "brand", "unit")}
    by_sku = {s.lower(): n for s, n in await _lower_in(db, Product, Product.sku, tenant_id, want["sku"], Product.name)}
    by_barcode = {b.lower(): n for b, n in await _lower_in(db, Product, Product.barcode, tenant_id, want["barcode"], Product.name)}
    names = {n.lower() for (n,) in await _lower_in(db, Product, Product.name, tenant_id, want["name"])}
    categories = {n.lower(): str(i) for n, i in await _lower_in(db, Category, Category.name, tenant_id, want["category"], Category.id)}
    brands = {n.lower(): str(i) for n, i in await _lower_in(db, Brand, Brand.name, tenant_id, want["brand"], Brand.id)}
    units = {n.lower(): str(i) for n, i in await _lower_in(db, Unit, Unit.name, tenant_id, want["unit"], Unit.id)}
    units.update({a.lower(): str(i) for a, i in await _lower_in(db, Unit, Unit.abbreviation, tenant_id, want["unit"], Unit.id) if a and a.lower() not in units})

    for row, out in zip(rows, results, strict=True):
        sku, barcode, name = _text(row, "sku"), _text(row, "barcode"), _text(row, "name")
        if sku and sku.lower() in by_sku:
            out["duplicate"] = f"SKU '{sku}' is already used by {by_sku[sku.lower()]}"
        elif barcode and barcode.lower() in by_barcode:
            out["duplicate"] = f"Barcode '{barcode}' is already used by {by_barcode[barcode.lower()]}"
        elif name and name.lower() in names:
            out["issues"].append(_issue("name", f"A product named '{name}' already exists; this adds a second one", "name already in Pesaa", "warning"))
        for key, label, found in (("category", "Category", categories), ("brand", "Brand", brands), ("unit", "Unit", units)):
            value = _text(row, key)
            if not value:
                continue
            if value.lower() in found:
                out["context"][f"_{key}_id"] = found[value.lower()]
            else:
                out["issues"].append(_issue(key, f"{label} '{value}' isn't in Pesaa yet; the product is imported without a {label.lower()}",
                                            f"{label.lower()} not in Pesaa", "warning"))


async def _check_customers(db, tenant_id, rows, results) -> None:
    from app.modules.sales.models.customer import Customer

    emails = {e.lower(): n for e, n in await _lower_in(db, Customer, Customer.email, tenant_id, {_text(r, "email").lower() for r in rows if _text(r, "email")}, Customer.name)}
    tins = {t.lower(): n for t, n in await _lower_in(db, Customer, Customer.tin, tenant_id, {_text(r, "tin").lower() for r in rows if _text(r, "tin")}, Customer.name)}
    phones: dict[str, str] = {}
    if any(phone_key(_text(r, "phone")) for r in rows):
        for phone, name in (await db.execute(select(Customer.phone, Customer.name).where(Customer.tenant_id == tenant_id, Customer.phone.is_not(None)))).all():
            if phone_key(phone):
                phones.setdefault(phone_key(phone), name)
    for row, out in zip(rows, results, strict=True):
        email, phone, tin = _text(row, "email").lower(), phone_key(_text(row, "phone")), _text(row, "tin").lower()
        if email and email in emails:
            out["duplicate"] = f"Email {email} already belongs to {emails[email]}"
        elif phone and phone in phones:
            out["duplicate"] = f"Phone {_text(row, 'phone')} already belongs to {phones[phone]}"
        elif tin and tin in tins:
            out["duplicate"] = f"TIN {_text(row, 'tin')} already belongs to {tins[tin]}"


async def _check_suppliers(db, tenant_id, rows, results) -> None:
    from app.modules.inventory.models.supplier import Supplier

    names = {n.lower() for (n,) in await _lower_in(db, Supplier, Supplier.name, tenant_id, {_text(r, "name").lower() for r in rows if _text(r, "name")})}
    emails = {e.lower(): n for e, n in await _lower_in(db, Supplier, Supplier.email, tenant_id, {_text(r, "email").lower() for r in rows if _text(r, "email")}, Supplier.name)}
    for row, out in zip(rows, results, strict=True):
        name, email = _text(row, "name"), _text(row, "email").lower()
        if name and name.lower() in names:
            out["duplicate"] = f"Supplier '{name}' already exists"
        elif email and email in emails:
            out["duplicate"] = f"Email {email} already belongs to {emails[email]}"


async def _check_sales(db, tenant_id, rows, results) -> None:
    from app.modules.inventory.models.product import Product
    from app.modules.sales.models.order import Order

    refs = {r for (r,) in (await db.execute(select(Order.client_order_id).where(
        Order.tenant_id == tenant_id, Order.client_order_id.in_({_text(r, "orderreference") for r in rows if _text(r, "orderreference")})))).all()}
    skus = {s.lower() for (s,) in await _lower_in(db, Product, Product.sku, tenant_id, {_text(r, "sku").lower() for r in rows if _text(r, "sku")})}
    for row, out in zip(rows, results, strict=True):
        ref, sku = _text(row, "orderreference"), _text(row, "sku")
        if ref and ref in refs:
            out["duplicate"] = f"Sale {ref} was already imported"
        if sku and sku.lower() not in skus:
            out["issues"].append(_issue("sku", f"No product has SKU '{sku}'", "SKU not in Pesaa"))


async def _check_accounts(db, tenant_id, rows, results) -> None:
    from app.modules.accounting.models.account import Account

    codes = {c.lower(): n for c, n in await _lower_in(db, Account, Account.code, tenant_id, {_text(r, "code").lower() for r in rows if _text(r, "code")}, Account.name)}
    for row, out in zip(rows, results, strict=True):
        code = _text(row, "code")
        if code and code.lower() in codes:
            out["duplicate"] = f"Account code {code} is already {codes[code.lower()]}"


# ── pictures pasted into a sheet ──────────────────────────────────────────────

def sheet_picture_previews(content: bytes) -> dict[str, Any]:
    """{rows: {sheet row: [{preview, problem}]}} with small JPEG previews, so pictures can be checked during review."""
    from app.modules.inventory.service import xlsx_pictures

    try:
        pictures, _ = xlsx_pictures.extract(content)
    except xlsx_pictures.NotAWorkbook as exc:
        raise ValidationError(str(exc)) from exc
    rows: dict[str, list[dict[str, str | None]]] = {}
    for picture in pictures[:1000]:
        if picture.row <= 1:
            continue
        preview = None
        if picture.data:
            try:
                img = PilImage.open(io.BytesIO(picture.data))
                img.thumbnail((160, 160))
                out = io.BytesIO()
                (img.convert("RGB") if img.mode not in ("RGB", "L") else img).save(out, "JPEG", quality=72)
                preview = "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode()
            except Exception:  # noqa: BLE001 - an unreadable picture is shown as a problem, never raised
                preview = None
        rows.setdefault(str(picture.row), []).append({"preview": preview, "problem": picture.problem or (None if preview else "The picture could not be read")})
    return {"rows": rows}


# ── Pesaa AI: reading photos and PDFs, suggesting column matches ──────────────

def ai_capabilities() -> dict[str, Any]:
    """What the configured provider can do for imports. The offline mock reads nothing, so the person is told rather than shown made-up rows."""
    provider = get_provider()
    if not isinstance(provider, OpenAIProvider):
        return {"available": False, "photos": False, "pdf": False, "mapping": False,
                "reason": "Reading photos and PDFs needs Pesaa AI, which isn't connected yet. Excel and CSV files work as usual."}
    vision = bool(settings.AI_VISION_MODEL) or provider.name == "openai"
    return {"available": True, "photos": vision, "pdf": provider.name == "openai", "mapping": True,
            "reason": None if vision else "This Pesaa AI setup reads text only, so photos and PDFs can't be read. Excel and CSV files work as usual."}


async def _guard(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID) -> OpenAIProvider:
    cfg = await get_ai_settings(db)
    if not cfg["enabled"]:
        raise AIDisabledError("Pesaa AI is switched off at the moment, so photos and PDFs can't be read. Excel and CSV files work as usual.")
    limit = await monthly_limit(db, tenant_id, cfg)
    if await used_this_month(db, tenant_id) >= limit:
        raise AILimitError(f"Your business has used all {limit} Pesaa AI requests for this month. Excel and CSV imports still work.")
    _check_rate(user_id)
    provider = get_provider()
    if not isinstance(provider, OpenAIProvider):
        raise AIUnavailableError(ai_capabilities()["reason"])
    return provider


async def _record(db: AsyncSession, tenant_id, user_id, provider: OpenAIProvider, module: str, status: str, started: float,
                  prompt: int = 0, completion: int = 0, error: str | None = None) -> None:
    cost = Decimal(str(round(prompt * settings.AI_COST_PER_MTOK_IN / 1e6 + completion * settings.AI_COST_PER_MTOK_OUT / 1e6, 6)))
    db.add(AiUsageEvent(tenant_id=tenant_id, user_id=user_id, feature="import", module=module[:40], provider=provider.name, model=provider.model,
                        status=status, error=(error or None) and error[:500], prompt_tokens=prompt, completion_tokens=completion,
                        est_cost_usd=cost, latency_ms=int((time.perf_counter() - started) * 1000), tool_calls=0))
    await db.commit()


def parse_json_reply(text: str | None) -> Any:
    """The JSON object in a model reply, with or without a code fence. Raises ValueError when there is none."""
    s = (text or "").strip()
    s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s).strip()
    start, end = s.find("{"), s.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object")
    return json.loads(s[start:end + 1])


def _source_part(content: bytes, content_type: str, filename: str) -> dict[str, Any]:
    if content_type == "application/pdf" or filename.lower().endswith(".pdf"):
        if not content.startswith(b"%PDF"):
            raise ValidationError("That file is not a readable PDF")
        return {"type": "file", "file": {"filename": filename or "records.pdf", "file_data": "data:application/pdf;base64," + base64.b64encode(content).decode()}}
    try:
        img = PilImage.open(io.BytesIO(content))
        img.load()
    except Exception as exc:
        raise ValidationError("That picture could not be opened. Use a JPEG or PNG photo.") from exc
    img.thumbnail((2000, 2000))  # enough to read handwriting and small print, small enough to send quickly
    out = io.BytesIO()
    (img.convert("RGB") if img.mode not in ("RGB", "L") else img).save(out, "JPEG", quality=88)
    return {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode(), "detail": "high"}}


EXTRACT_PROMPT = """You transcribe business records from a photo or PDF into a table, for import into the Pesaa business app.
Fields to fill (key: meaning): {fields}
Rules:
- Copy values exactly as written. Never calculate, convert, round, translate, correct spelling or guess.
- If a value is missing, blank or not written, leave it as an empty string. Never invent values.
- One row per record (per product, customer, line...). Skip headings, totals and signatures.
- Numbers: copy the digits as written, including separators (e.g. "2,500").
- List every value you are not sure you read correctly (smudged, handwritten, cut off) in "uncertain".
Reply with JSON only: {{"rows": [{{"<key>": "<value>", ...}}], "uncertain": [{{"row": <0-based row>, "field": "<key>"}}], "note": "<one short sentence about the document, or empty>"}}"""


async def extract(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, module: str, fields: list[dict[str, str]],
                  content: bytes, content_type: str, filename: str) -> dict[str, Any]:
    """Rows read from a photographed or PDF record, as {headers, rows, uncertain: [[row, column]], note}. Values are transcribed,
    never computed; anything the model is unsure of is flagged so the person checks it against the picture before importing."""
    if module not in MODULES:
        raise ValidationError("Unknown import type")
    if not content:
        raise ValidationError("The file is empty")
    if len(content) > MAX_SOURCE_BYTES:
        raise ValidationError("The file is larger than 12MB. Take the photo at a lower resolution or split the PDF.")
    caps = ai_capabilities()
    is_pdf = content_type == "application/pdf" or filename.lower().endswith(".pdf")
    if not caps["available"] or not (caps["pdf"] if is_pdf else caps["photos"]):
        raise AIUnavailableError(caps["reason"] or "This Pesaa AI setup can't read PDFs. Take a photo of each page instead.")
    keys = [f["key"] for f in fields if f.get("key")][:40]
    if not keys:
        raise ValidationError("No fields to read")
    provider = await _guard(db, tenant_id, user_id)
    described = "; ".join(f"{f['key']}: {f.get('label') or f['key']}" for f in fields[:40] if f.get("key"))
    messages = [{"role": "user", "content": [{"type": "text", "text": EXTRACT_PROMPT.format(fields=described)}, _source_part(content, content_type, filename)]}]
    started = time.perf_counter()
    model = settings.AI_VISION_MODEL or provider.model
    vision = OpenAIProvider(provider._key, model, provider._base, settings.AI_IMPORT_TIMEOUT_SECONDS, name=provider.name, extra_body=provider._extra)
    try:
        reply = await vision.complete_parts(messages, max_tokens=8000, model=model)
        data = parse_json_reply(reply.text)
    except ProviderError as exc:
        await _record(db, tenant_id, user_id, provider, module, "error", started, error=str(exc))
        raise AIUnavailableError(f"{exc}. Try again, or type the records into a spreadsheet.") from exc
    except ValueError as exc:
        await _record(db, tenant_id, user_id, provider, module, "error", started, error="unreadable reply")
        raise AIUnavailableError("Pesaa AI couldn't read a table from this file. Try a sharper, well-lit photo of one page.") from exc
    await _record(db, tenant_id, user_id, provider, module, "ok", started, reply.prompt_tokens, reply.completion_tokens)
    return shape_extraction(data, fields)


def shape_extraction(data: Any, fields: list[dict[str, str]]) -> dict[str, Any]:
    """The model's JSON as a plain grid with the field labels as headings. Only known fields are kept, values stay text."""
    keys = [f["key"] for f in fields if f.get("key")]
    labels = [f.get("label") or f["key"] for f in fields if f.get("key")]
    raw_rows = data.get("rows") if isinstance(data, dict) else None
    rows: list[list[str]] = []
    for item in raw_rows if isinstance(raw_rows, list) else []:
        if not isinstance(item, dict):
            continue
        line = ["" if item.get(k) is None else str(item.get(k)).strip() for k in keys]
        if any(line):
            rows.append(line)
    rows = rows[:MAX_ROWS]
    uncertain: list[list[int]] = []
    for u in data.get("uncertain") or [] if isinstance(data, dict) else []:
        if isinstance(u, dict) and isinstance(u.get("row"), int) and u.get("field") in keys and 0 <= u["row"] < len(rows):
            uncertain.append([u["row"], keys.index(u["field"])])
    note = data.get("note") if isinstance(data, dict) and isinstance(data.get("note"), str) else ""
    return {"headers": labels, "rows": rows, "uncertain": uncertain, "note": note[:300]}


MAPPING_PROMPT = """Match spreadsheet columns to the fields of a {module} import in the Pesaa business app.
Fields (key: meaning): {fields}
Columns, each with a few sample values: {columns}
For each column, give the field key it holds, or null if none fits. Use each field at most once. Do not guess: null is better than a weak match.
Reply with JSON only: {{"mapping": {{"<column heading>": "<field key or null>"}}}}"""


async def suggest_mapping(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, module: str, fields: list[dict[str, str]],
                          columns: list[dict[str, Any]]) -> dict[str, str | None]:
    """Pesaa AI's suggestion for columns the built-in matching didn't recognise. Only headings and a few sample values are sent;
    the result is shown as a suggestion the person can change before anything is imported."""
    if module not in MODULES:
        raise ValidationError("Unknown import type")
    provider = await _guard(db, tenant_id, user_id)
    keys = {f["key"] for f in fields if f.get("key")}
    described = "; ".join(f"{f['key']}: {f.get('label') or f['key']}" for f in fields[:40] if f.get("key"))
    shown = "; ".join(f"{str(c.get('header'))[:60]!r} e.g. {', '.join(repr(str(v)[:30]) for v in (c.get('samples') or [])[:3])}" for c in columns[:40])
    started = time.perf_counter()
    try:
        reply = await provider.complete_parts([{"role": "user", "content": MAPPING_PROMPT.format(module=module, fields=described, columns=shown)}], max_tokens=800)
        data = parse_json_reply(reply.text)
    except ProviderError as exc:
        await _record(db, tenant_id, user_id, provider, module, "error", started, error=str(exc))
        raise AIUnavailableError(str(exc)) from exc
    except ValueError as exc:
        await _record(db, tenant_id, user_id, provider, module, "error", started, error="unreadable reply")
        raise AIUnavailableError("Pesaa AI couldn't suggest matches this time. Choose the fields from the lists.") from exc
    await _record(db, tenant_id, user_id, provider, module, "ok", started, reply.prompt_tokens, reply.completion_tokens)
    headers = {str(c.get("header")) for c in columns}
    mapping = data.get("mapping") if isinstance(data, dict) else None
    out: dict[str, str | None] = {}
    used: set[str] = set()
    for header, key in (mapping.items() if isinstance(mapping, dict) else []):
        if header in headers:
            ok = isinstance(key, str) and key in keys and key not in used
            out[header] = key if ok else None
            if ok:
                used.add(key)
    return out
