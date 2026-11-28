import asyncio
import io
import re
import uuid
from pathlib import Path
from xml.sax.saxutils import escape as esc

from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.brand_pdf import business_contact_lines
from app.core.currency import format_money
from app.core.logging import get_logger
from app.modules.sales.schemas.order import OrderRead
from app.modules.sales.service.order import get_order
from app.modules.tenants.models import Tenant
from app.modules.tenants.repository import TenantRepository

log = get_logger("sales.invoice_pdf")

FOREGROUND = colors.HexColor("#111827")
MUTED = colors.HexColor("#6b7280")
BORDER = colors.HexColor("#e5e7eb")
CARD_BG = colors.HexColor("#f9fafb")
EMERALD = colors.HexColor("#059669")
RED = colors.HexColor("#dc2626")
AMBER = colors.HexColor("#b45309")

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm
CONTENT_W = PAGE_W - 2 * MARGIN

FONT = "Helvetica"
FONT_BOLD = "Helvetica-Bold"

PAYMENT_STATUS_COLORS = {"Paid": EMERALD, "PartiallyPaid": AMBER, "Unpaid": RED}
PAYMENT_STATUS_LABELS = {"Paid": "Paid", "PartiallyPaid": "Partially paid", "Unpaid": "Unpaid"}
# How a payment method reads on paper (the stored value is a short code; unknown codes are shown as stored).
METHOD_LABELS = {"cash": "Cash", "mobile": "Mobile money", "momo": "Mobile money", "mobile_money": "Mobile money", "card": "Card",
                 "bank": "Bank transfer", "bank_transfer": "Bank transfer", "credit": "On credit", "split": "Split"}


def _method(value: str | None) -> str:
    return METHOD_LABELS.get((value or "").lower(), value or "")


def _fmt_money(value: float, currency: str) -> str:
    """Amount in `currency` with that currency's own decimals (RWF whole, USD cents, KWD mills)."""
    return format_money(value, currency)


async def _load_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> Tenant:
    tenant = await TenantRepository(db).get(tenant_id)
    if tenant is None:
        return Tenant(name="")
    return tenant


def _tenant_contact_lines(tenant: Tenant) -> list[str]:
    return business_contact_lines(tenant)


def _register_fonts() -> None:
    global FONT, FONT_BOLD
    fonts_dir = Path(__file__).resolve().parents[4] / "assets" / "fonts"
    regular = fonts_dir / "Inter-Regular.ttf"
    bold = fonts_dir / "Inter-Bold.ttf"
    if not (regular.exists() and bold.exists()):
        return
    try:
        pdfmetrics.registerFont(TTFont("App", str(regular)))
        pdfmetrics.registerFont(TTFont("App-Bold", str(bold)))
        registerFontFamily("App", normal="App", bold="App-Bold", italic="App", boldItalic="App-Bold")
    except OSError:
        log.warning("sales.invoice_pdf.fonts.skip", extra={"_extra_fields": {"path": str(fonts_dir)}})
        return
    FONT = "App"
    FONT_BOLD = "App-Bold"


def customer_note(notes: str | None) -> str:
    """The note a customer sees. The till's own stamp ("POS — cash — name") is for reports; only what the cashier typed after "|" is kept."""
    if not notes:
        return ""
    if not re.match(r"\s*POS\s*[—\-–:]", notes, re.IGNORECASE):
        return notes
    _, bar, typed = notes.partition(" | ")
    return typed.strip() if bar else ""


def _styles(accent: colors.Color) -> dict:
    return {
        "company": ParagraphStyle("company", fontName=FONT_BOLD, fontSize=18, leading=22, textColor=FOREGROUND),
        "contact": ParagraphStyle("contact", fontName=FONT, fontSize=8.5, leading=12, textColor=MUTED),
        "invoice_label": ParagraphStyle("invoice_label", fontName=FONT_BOLD, fontSize=8.5, leading=11, textColor=MUTED),
        "invoice_number": ParagraphStyle("invoice_number", fontName=FONT_BOLD, fontSize=14, leading=18, textColor=accent),
        "h2": ParagraphStyle("h2", fontName=FONT_BOLD, fontSize=9, leading=12, textColor=accent, spaceAfter=3),
        "body": ParagraphStyle("body", fontName=FONT_BOLD, fontSize=10, leading=13, textColor=FOREGROUND),
        "body_muted": ParagraphStyle("body_muted", fontName=FONT, fontSize=8.5, leading=12, textColor=MUTED),
        "cell": ParagraphStyle("cell", fontName=FONT, fontSize=8.5, leading=11, textColor=FOREGROUND),
        "cell_muted": ParagraphStyle("cell_muted", fontName=FONT, fontSize=7.5, leading=10, textColor=MUTED),
        "cell_right": ParagraphStyle("cell_right", fontName=FONT, fontSize=8.5, leading=11, textColor=FOREGROUND, alignment=2),
        "cell_right_bold": ParagraphStyle("cell_right_bold", fontName=FONT_BOLD, fontSize=8.5, leading=11, textColor=FOREGROUND, alignment=2),
        "status": ParagraphStyle("status", fontName=FONT_BOLD, fontSize=8, leading=10, textColor=colors.white, alignment=1),
        "total_label": ParagraphStyle("total_label", fontName=FONT_BOLD, fontSize=10.5, leading=14, textColor=accent),
        "total_value": ParagraphStyle("total_value", fontName=FONT_BOLD, fontSize=10.5, leading=14, textColor=accent, alignment=2),
        "footer_thanks": ParagraphStyle("footer_thanks", fontName=FONT_BOLD, fontSize=9, leading=12, textColor=FOREGROUND),
        "footer_muted": ParagraphStyle("footer_muted", fontName=FONT, fontSize=7.5, leading=10, textColor=MUTED),
    }


INVOICE_INK = "#111111"  # the invoice is printed in black; only the status stamp is coloured (see _stamp_color)


def _logo_flowable(tenant: Tenant):
    """The uploaded logo as it is, or a black monogram when there is none."""
    from types import SimpleNamespace

    from app.core.brand_pdf import logo_flowable
    return logo_flowable(SimpleNamespace(logo_url=getattr(tenant, "logo_url", None), name=getattr(tenant, "name", None), brand_color=INVOICE_INK), 34, 20)


def _qr_drawing(data: str, size_mm: float) -> Drawing:
    widget = QrCodeWidget(data)
    bounds = widget.getBounds()
    w, h = bounds[2] - bounds[0], bounds[3] - bounds[1]
    scale_w, scale_h = (size_mm * mm) / w, (size_mm * mm) / h
    d = Drawing(size_mm * mm, size_mm * mm, transform=[scale_w, 0, 0, scale_h, 0, 0])
    d.add(widget)
    return d


def _qty(q: float) -> str:
    return f"{q:g}"


TREATMENT_LABELS = {"standard": "Standard", "zero_rated": "Zero-rated", "exempt": "Exempt", "out_of_scope": "Out of scope"}
INK = colors.HexColor("#1f2937")
SOFT = colors.HexColor("#9ca3af")
HEAD_BG = colors.HexColor("#f9fafb")


def _status(order: OrderRead) -> tuple[str, colors.Color]:
    """One status on the document: void, not yet a sale, or how far it is paid."""
    if order.status == "Cancelled":
        return "Void", RED
    if order.status != "Completed":
        return order.status, MUTED
    return PAYMENT_STATUS_LABELS.get(order.payment_status, order.payment_status), PAYMENT_STATUS_COLORS.get(order.payment_status, MUTED)


# The status stamp is the one coloured mark on the invoice: Paid in black, Partially paid amber, Unpaid / Overdue / Void red
# (the design system's warning and error colours).
STAMP_RED = colors.HexColor("#B91C1C")
STAMP_AMBER = colors.HexColor("#B45309")


def _stamp_color(order: OrderRead, ink: colors.Color) -> colors.Color:
    if order.status == "Cancelled":
        return STAMP_RED
    if order.status != "Completed":
        return ink
    return {"Unpaid": STAMP_RED, "PartiallyPaid": STAMP_AMBER}.get(order.payment_status, ink)


def _tax_label(item) -> str:
    treatment = item.tax_treatment
    if treatment == "standard":
        return f"{(item.tax_rate or 0):g}%"
    if treatment == "zero_rated":
        return "0%"
    return TREATMENT_LABELS.get(treatment or "", "")


def _vat_summary(order: OrderRead) -> list[tuple[str, float, float]]:
    """Net amount and VAT per tax treatment, from what was frozen on each line when it was priced."""
    groups: dict[tuple[str, float], list[float]] = {}
    for item in order.items:
        if item.tax_treatment not in TREATMENT_LABELS or item.taxable_base is None:
            continue
        key = (item.tax_treatment, float(item.tax_rate or 0))
        bucket = groups.setdefault(key, [0.0, 0.0])
        bucket[0] += float(item.taxable_base)
        bucket[1] += float(item.tax_amount or 0)
    order_key = {"standard": 0, "zero_rated": 1, "exempt": 2, "out_of_scope": 3}
    rows = []
    for (treatment, rate), (base, tax) in sorted(groups.items(), key=lambda kv: order_key[kv[0][0]]):
        name = f"Standard {rate:g}%" if treatment == "standard" else ("Zero-rated 0%" if treatment == "zero_rated" else TREATMENT_LABELS[treatment])
        rows.append((name, round(base, 2), round(tax, 2)))
    return rows


def _box(rows, widths, style=()) -> Table:
    t = Table(rows, colWidths=widths)
    t.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("VALIGN", (0, 0), (-1, -1), "TOP"), *style,
    ]))
    return t


# ── Shared A4 document pieces (invoice and quotation): one header, party block, items table, VAT summary, totals and closing.

def _ps(name, size=8.5, bold=False, color=INK, align=0, leading=None) -> ParagraphStyle:
    return ParagraphStyle(name, fontName=FONT_BOLD if bold else FONT, fontSize=size, leading=leading or size * 1.35, textColor=color, alignment=align)


def _doc_styles(accent: colors.Color) -> dict:
    """The type scale of the A4 sales documents (read at build time, after _register_fonts picked the font)."""
    ps = _ps
    return {
        "company": ps("company", 16, True, FOREGROUND, leading=20),
        "contact": ps("contact", 8, color=MUTED, leading=11.5),
        "title": ParagraphStyle("title", fontName=FONT, fontSize=24, leading=28, textColor=FOREGROUND, alignment=2),
        "number": ps("number", 10, True, INK, 2),
        "cap": ps("cap", 7, True, MUTED),
        "cap_accent": ps("cap_accent", 7, True, accent),
        "name": ps("name", 10.5, True, FOREGROUND),
        "small": ps("small", 8, color=MUTED, leading=11.5),
        "meta_k": ps("meta_k", 8, color=MUTED),
        "meta_v": ps("meta_v", 8, True, FOREGROUND, 2),
        "th": ps("th", 6.8, True, INK),
        "th_r": ps("th_r", 6.8, True, INK, 2),
        "th_c": ps("th_c", 6.8, True, INK, 1),
        "td": ps("td", 8.3, color=FOREGROUND),
        "td_sku": ps("td_sku", 7, color=SOFT),
        "td_r": ps("td_r", 8.3, color=FOREGROUND, align=2),
        "td_rm": ps("td_rm", 8.3, color=MUTED, align=2),
        "td_c": ps("td_c", 7.5, color=INK, align=1),
        "td_rb": ps("td_rb", 8.3, True, FOREGROUND, 2),
        "note": ps("note", 7, color=SOFT),
        "row_k": ps("row_k", 8.3, color=MUTED),
        "row_v": ps("row_v", 8.3, color=FOREGROUND, align=2),
        "grand_k": ps("grand_k", 9, True, FOREGROUND),
        "grand_v": ps("grand_v", 13, True, FOREGROUND, 2, 16),
        "due_k": ps("due_k", 9, True, FOREGROUND),
        "due_v": ps("due_v", 11.5, True, accent, 2, 14),
        "body": ps("body", 8, color=INK, leading=11.5),
        "thanks": ps("thanks", 9, True, FOREGROUND),
        "status": ps("status", 7, True, colors.white, 1),
    }


def _pill(text: str, color: colors.Color, s: dict) -> Table:
    """A small rounded status pill, as wide as its words."""
    width = pdfmetrics.stringWidth(text, FONT_BOLD, 7) + 19  # 16 padding + room so the word never wraps away
    chip = Table([[Paragraph(esc(text), s["status"])]], colWidths=[width])
    chip.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), color), ("ROUNDEDCORNERS", [6, 6, 6, 6]),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
    ]))
    chip.hAlign = "RIGHT"
    return chip


def _doc_header(tenant: Tenant, s: dict, title: str, number: str, chips: list[tuple[str, colors.Color]]) -> list:
    """Logo, name and contact lines on the left; the document title, "<title> no." and its status pills on the right."""
    from app.core.brand_pdf import business_name

    left = [[_logo_flowable(tenant)], [Spacer(1, 3 * mm)], [Paragraph(esc(tenant.name or business_name(tenant)), s["company"])]]
    left += [[Paragraph(esc(line), s["contact"])] for line in _tenant_contact_lines(tenant)]
    cells, widths = [], []
    for n, (text, color) in enumerate(chips):
        if n:
            cells.append(Spacer(4, 1))
            widths.append(4)
        cells.append(_pill(text, color, s))
        widths.append(pdfmetrics.stringWidth(text, FONT_BOLD, 7) + 19)
    pill_row = _box([cells], widths)
    pill_row.hAlign = "RIGHT"
    number_line = f'<font name="{FONT}" size="8" color="{MUTED.hexval().replace("0x", "#")}">{esc(title)} no.</font>&nbsp;&nbsp;{esc(number)}'
    right = [[Paragraph(esc(title.upper()), s["title"])], [Paragraph(number_line, s["number"])], [Spacer(1, 2 * mm)], [pill_row]]
    return [_box([[_box(left, [CONTENT_W * 0.6]), _box(right, [CONTENT_W * 0.4], [("ALIGN", (0, 0), (-1, -1), "RIGHT")])]],
                 [CONTENT_W * 0.6, CONTENT_W * 0.4]),
            Spacer(1, 6 * mm), HRFlowable(width="100%", thickness=0.6, color=BORDER), Spacer(1, 5 * mm)]


def _party_block(s: dict, caption: str, customer, nobody: str, meta: list[tuple[str, str]]) -> list:
    """Who the document is for (only the details they have) beside a key/value list of the document's facts."""
    bill = [[Paragraph(esc(caption.upper()), s["cap_accent"])], [Spacer(1, 1.5 * mm)]]
    if customer:
        bill.append([Paragraph(esc(customer.name), s["name"])])
        for line in (customer.address, " · ".join(x for x in (customer.phone, customer.email) if x)):
            if line:
                bill.append([Paragraph(esc(line), s["small"])])
        if getattr(customer, "tin", None):
            bill.append([Paragraph(f"TIN {esc(customer.tin)}", s["small"])])
    else:
        bill.append([Paragraph(esc(nobody), s["name"])])
    meta_w = 62 * mm
    meta_rows = [[Paragraph(esc(k), s["meta_k"]), Paragraph(esc(str(v)), s["meta_v"])] for k, v in meta]
    meta_table = _box(meta_rows, [meta_w * 0.42, meta_w * 0.58], [
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, colors.HexColor("#f3f4f6")),
    ])
    return [_box([[_box(bill, [CONTENT_W - meta_w - 10 * mm]), Spacer(10 * mm, 1), meta_table]],
                 [CONTENT_W - meta_w - 10 * mm, 10 * mm, meta_w]),
            Spacer(1, 7 * mm)]


def _variant_text(attributes: dict | None) -> str:
    return " · ".join(f"{k}: {v}" for k, v in (attributes or {}).items() if v not in (None, ""))


def _items_table(items, s: dict, m, tenant: Tenant, units: dict | None = None, show_variants: bool = False) -> tuple[list, bool]:
    """The priced lines. Unit, Discount and Tax columns appear only when some line has them; the header repeats on every page.
    Returns the flowables and whether the Tax column (and so a VAT treatment) is present."""
    units = units or {}
    unit_of = lambda item: units.get(getattr(item, "product_id", None), "")
    show_unit = any(unit_of(item) for item in items)
    show_disc = any((item.discount or 0) > 0 for item in items)
    show_tax = any(item.tax_treatment in TREATMENT_LABELS for item in items)
    cols = [("#", 7 * mm, "th_c"), ("DESCRIPTION", None, "th"), ("QTY", 14 * mm, "th_r")]
    if show_unit:
        cols.append(("UNIT", 13 * mm, "th"))
    cols.append(("UNIT PRICE", 24 * mm, "th_r"))
    if show_disc:
        cols.append(("DISCOUNT", 20 * mm, "th_r"))
    if show_tax:
        cols.append(("TAX", 17 * mm, "th_c"))
    cols.append(("LINE TOTAL", 27 * mm, "th_r"))
    fixed = sum(w for _, w, _ in cols if w)
    widths = [w if w else CONTENT_W - fixed for _, w, _ in cols]
    rows = [[Paragraph(name, s[st]) for name, _, st in cols]]
    for n, item in enumerate(items, 1):
        desc = [[Paragraph(esc(item.product_name), s["td"])]]
        if item.sku:
            desc.append([Paragraph(esc(item.sku), s["td_sku"])])
        variant = _variant_text(getattr(item, "variant_attributes", None)) if show_variants else ""
        if variant:
            desc.append([Paragraph(esc(variant), s["td_sku"])])
        row = [Paragraph(str(n), s["td_c"]), _box(desc, [widths[1] - 8]), Paragraph(_qty(item.quantity), s["td_r"])]
        if show_unit:
            row.append(Paragraph(esc(unit_of(item)), s["td"]))
        row.append(Paragraph(m(item.unit_price), s["td_r"]))
        if show_disc:
            row.append(Paragraph(m(item.discount) if item.discount else "—", s["td_rm"]))
        if show_tax:
            row.append(Paragraph(esc(_tax_label(item)) or "—", s["td_c"]))
        row.append(Paragraph(m(item.line_total), s["td_rb"]))
        rows.append(row)
    items_table = Table(rows, colWidths=widths, repeatRows=1)
    items_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HEAD_BG),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, colors.HexColor("#d1d5db")),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, colors.HexColor("#eef0f2")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    flow: list = [items_table]
    if show_tax:
        flow.append(Spacer(1, 1.5 * mm))
        flow.append(Paragraph("Prices include VAT." if _inclusive(tenant) else "Prices exclude VAT; VAT is added in the totals.", s["note"]))
    flow.append(Spacer(1, 6 * mm))
    return flow, show_tax


def _inclusive(tenant: Tenant) -> bool:
    return (getattr(tenant, "vat_pricing_mode", None) or "inclusive") == "inclusive"


TOTALS_W = 70 * mm
SIDE_W = CONTENT_W - TOTALS_W - 10 * mm


def _vat_side(doc, s: dict, m) -> list:
    """The VAT summary rows for the left column (none when there is no VAT to show)."""
    vat_rows = _vat_summary(doc)
    if not (vat_rows and doc.tax > 0 or len(vat_rows) > 1):
        return []
    vt = [[Paragraph("Tax rate", s["meta_k"]), Paragraph("Net amount", _ps("vh", 8, color=MUTED, align=2)), Paragraph("VAT", _ps("vh2", 8, color=MUTED, align=2))]]
    vt += [[Paragraph(esc(name), s["body"]), Paragraph(m(base), s["row_v"]), Paragraph(m(tax) if name != "Exempt" else "—", s["row_v"])] for name, base, tax in vat_rows]
    return [[Paragraph("VAT SUMMARY", s["cap"])], [Spacer(1, 1.5 * mm)],
            [_box(vt, [SIDE_W * 0.46, SIDE_W * 0.3, SIDE_W * 0.24], [
                ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
                ("LINEBELOW", (0, 0), (-1, 0), 0.5, BORDER)])], [Spacer(1, 5 * mm)]]


def _info_box(s: dict, caption: str, lines: list) -> list:
    """A soft grey box with a caption, for the left column (payment information, terms)."""
    box_rows = [[Paragraph(esc(caption.upper()), s["cap"])], [Spacer(1, 1.5 * mm)]] + [[p] for p in lines]
    return [_box(box_rows, [SIDE_W - 16], [
        ("BACKGROUND", (0, 0), (-1, -1), HEAD_BG), ("ROUNDEDCORNERS", [5, 5, 5, 5]),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (0, 0), 8), ("BOTTOMPADDING", (0, -1), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 1), (-1, -2), 1.5)])]


def _totals_rows(doc, s: dict, m, tenant: Tenant, show_tax: bool, total_label: str) -> tuple[list, int]:
    """Subtotal, discount, VAT and the bold total; returns the rows and the index of the total row."""
    trow = lambda k, v: [Paragraph(esc(k), s["row_k"]), Paragraph(v, s["row_v"])]
    tot = [trow("Subtotal", m(doc.subtotal))]
    if doc.discount > 0:
        tot.append(trow("Discount", f"− {m(doc.discount)}"))
    if doc.tax > 0 or show_tax:
        tot.append(trow("Amount excl. VAT", m(round(doc.total - doc.tax, 2))))
        tot.append(trow("VAT (included)" if _inclusive(tenant) else "VAT", m(doc.tax)))
    grand_at = len(tot)
    tot.append([Paragraph(esc(total_label), s["grand_k"]), Paragraph(esc(m(doc.total)), s["grand_v"])])
    return tot, grand_at


def _totals_style(grand_at: int) -> list:
    return [("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
            ("LINEABOVE", (0, grand_at), (-1, grand_at), 1, FOREGROUND),
            ("TOPPADDING", (0, grand_at), (-1, grand_at), 7), ("BOTTOMPADDING", (0, grand_at), (-1, grand_at), 7),
            ("VALIGN", (0, grand_at), (-1, grand_at), "MIDDLE")]


def _lower_section(side: list, totals: Table) -> list:
    """Left column (VAT summary, boxes) beside the totals table on the right."""
    return [_box([[_box(side, [SIDE_W]) if side else Spacer(1, 1), Spacer(10 * mm, 1), totals]], [SIDE_W, 10 * mm, TOTALS_W]), Spacer(1, 8 * mm)]


def _closing(tenant: Tenant) -> list:
    """The same closing as the receipt: thanks in the business's name, then "Powered by Pesaa" under a dashed line."""
    from app.core.brand_pdf import POWERED_BY_MARKUP
    return [Spacer(1, 2 * mm), HRFlowable(width="100%", thickness=0.5, color=BORDER, dash=(2, 2)), Spacer(1, 3 * mm),
            Paragraph(esc(f"Thank you for shopping with {(tenant.name or '').strip() or 'us'}!"), _ps("thanks_c", 9.5, True, FOREGROUND, 1)),
            Paragraph("We look forward to seeing you again.", _ps("welcome_c", 8, color=MUTED, align=1)),
            Spacer(1, 3 * mm), HRFlowable(width="100%", thickness=0.5, color=BORDER, dash=(2, 2)), Spacer(1, 2 * mm),
            Paragraph(POWERED_BY_MARKUP, _ps("powered_c", 7, color=MUTED, align=1))]


def _top_rule(accent: colors.Color):
    """On every page: only the thin rule across the top (no footer)."""
    def draw(canvas, _doc):
        canvas.saveState()
        canvas.setFillColor(accent)
        canvas.rect(0, PAGE_H - 1.4 * mm, PAGE_W, 1.4 * mm, stroke=0, fill=1)
        canvas.restoreState()
    return draw


def _new_doc(buf, title: str, author: str) -> SimpleDocTemplate:
    return SimpleDocTemplate(buf, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=16 * mm, bottomMargin=18 * mm, title=title, author=author)


def _build_pdf(order: OrderRead, tenant: Tenant, label: str | None = None, due_label: str = "Due") -> bytes:
    """The A4 invoice in the business's own name and logo, printed in black. Only data the business and customer have is printed;
    an empty field leaves no line behind. It closes like the receipt: thanks in the business's name and "Powered by Pesaa"."""
    from app.core.brand_pdf import business_name
    from app.modules.sales.service.document_words import sale_document

    accent = colors.HexColor(INVOICE_INK)  # black; the status stamp alone takes a colour
    # The title follows the number: INV-/ORD- is an INVOICE, SO- (saved before it was completed) a SALES ORDER.
    title, date_label = sale_document(order.order_number)
    label = label or title
    base_currency = tenant.currency or "USD"
    # The invoice is shown in its OWN currency; an order from before multi-currency has none and is in
    # the tenant's base currency.
    currency = order.currency_code or base_currency
    m = lambda v: _fmt_money(v, currency)
    issuer = business_name(tenant)
    s = _doc_styles(accent)
    buf = io.BytesIO()
    doc = _new_doc(buf, f"{label} {order.order_number} — {issuer}", issuer)

    # ── Header (the sale's order number is the invoice number) with one status, plus Overdue
    status_text, _status_color = _status(order)
    chips = [(status_text.upper(), _stamp_color(order, accent))]
    if order.status == "Completed" and getattr(order, "is_overdue", False):
        chips.append(("OVERDUE", STAMP_RED))
    flow: list = _doc_header(tenant, s, label, order.order_number, chips)

    # ── Bill to and the invoice facts
    meta: list[tuple[str, str]] = []
    if order.ordered_at:
        meta.append((date_label, order.ordered_at.strftime("%d %b %Y")))
    if order.due_date and order.outstanding_balance > 0:
        meta.append((f"{due_label} date", order.due_date.strftime("%d %b %Y")))
    if getattr(order, "sales_order_number", None):
        meta.append(("Order ref.", order.sales_order_number))
    if getattr(order, "quotation_number", None):
        meta.append(("Quotation ref.", order.quotation_number))
    meta.append(("Currency", currency))
    if order.payment_method:
        meta.append(("Payment", _method(order.payment_method)))
    if order.salesperson_name:
        meta.append(("Served by", order.salesperson_name))
    flow += _party_block(s, "Bill to", order.customer, "Walk-in customer", meta)

    # ── Line items
    items_flow, show_tax = _items_table(order.items, s, m, tenant)
    flow += items_flow

    # ── Left: VAT summary and how to pay. Right: totals.
    side = _vat_side(order, s, m)
    pay_lines: list = []
    received = [p for p in order.payments if p.status != "Reversed"]
    for p in received:
        bits = [p.paid_at.strftime("%d %b %Y") if p.paid_at else None, _method(p.payment_method), f"ref. {p.reference_number}" if p.reference_number else None]
        pay_lines.append(Paragraph(f"Received {esc(m(p.amount))} · {esc(' · '.join(b for b in bits if b))}", s["body"]))
    terms = (getattr(tenant, "quotation_terms", None) or "").strip()
    if order.status == "Completed" and order.outstanding_balance > 0:
        pay_lines.append(Paragraph(f"Please quote <b>{esc(order.order_number)}</b> as the payment reference.", s["body"]))
    if terms:
        pay_lines += [Paragraph(esc(line), s["body"]) for line in terms.splitlines() if line.strip()]
    if pay_lines:
        side.append(_info_box(s, "Payment information", pay_lines))

    trow = lambda k, v: [Paragraph(esc(k), s["row_k"]), Paragraph(v, s["row_v"])]
    tot, grand_at = _totals_rows(order, s, m, tenant, show_tax, "Grand total")
    if currency != base_currency and order.base_total is not None and order.exchange_rate is not None:
        tot.append(trow(f"In {base_currency}", _fmt_money(order.base_total, base_currency)))
        tot.append(trow("Exchange rate", esc(f"1 {currency} = {format_money(order.exchange_rate, base_currency)}")))
    tstyle = _totals_style(grand_at)
    if order.status == "Completed":
        paid_at = len(tot)
        tot.append(trow("Amount paid", f"− {m(order.amount_paid)}" if order.amount_paid else m(0)))
        tot.append([Paragraph("Balance due", s["due_k"]), Paragraph(esc(m(order.outstanding_balance)), s["due_v"])])
        tstyle += [("LINEABOVE", (0, paid_at), (-1, paid_at), 0.5, BORDER), ("TOPPADDING", (0, paid_at), (-1, paid_at), 6),
                   ("BACKGROUND", (0, -1), (-1, -1), HEAD_BG), ("ROUNDEDCORNERS", [0, 0, 5, 5]),
                   ("TOPPADDING", (0, -1), (-1, -1), 7), ("BOTTOMPADDING", (0, -1), (-1, -1), 7),
                   ("LEFTPADDING", (0, -1), (-1, -1), 7), ("RIGHTPADDING", (0, -1), (-1, -1), 7), ("VALIGN", (0, -1), (-1, -1), "MIDDLE")]
    totals = _box(tot, [TOTALS_W * 0.48, TOTALS_W * 0.52], tstyle)
    flow += _lower_section(side, totals)

    # ── Notes and the receipt's closing
    note = customer_note(order.notes)
    if note:
        flow += [Paragraph("NOTES", s["cap"]), Spacer(1, 1.5 * mm), Paragraph(esc(note), s["body"]), Spacer(1, 5 * mm)]
    flow += _closing(tenant)

    doc.build(flow, onFirstPage=_top_rule(accent), onLaterPages=_top_rule(accent))
    return buf.getvalue()


async def generate_order_invoice_pdf(db: AsyncSession, tenant_id: uuid.UUID, order_id: uuid.UUID) -> tuple[str, bytes]:
    """Renders an Order as a branded A4 invoice PDF.

    Deliberately does NOT include any Rwanda EBM/RRA-style tax-authority
    fields (SDC ID, cryptographic receipt signature, MRC) — those are only
    issued by a certified Sales Data Controller once a tenant has real EBM
    credentials, and fabricating them would misrepresent an uncertified
    invoice as tax-authority-verified. No QR code is printed on the invoice.
    """
    order = await get_order(db, tenant_id, order_id)
    tenant = await _load_tenant(db, tenant_id)
    _register_fonts()
    # built in a worker thread: generating the file is CPU work and must not hold up other people's requests
    pdf_bytes = await asyncio.to_thread(_build_pdf, order, tenant)
    from app.modules.sales.service.document_words import file_name, sale_document

    return file_name(sale_document(order.order_number)[0], order.order_number), pdf_bytes
