import io
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
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
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

STATUS_COLORS = {"Completed": EMERALD, "Pending": AMBER, "Cancelled": RED, "Draft": MUTED}
PAYMENT_STATUS_COLORS = {"Paid": EMERALD, "PartiallyPaid": AMBER, "Unpaid": RED}
PAYMENT_STATUS_LABELS = {"Paid": "Paid", "PartiallyPaid": "Partially Paid", "Unpaid": "Unpaid"}


def _fmt_money(value: float, currency: str) -> str:
    v = float(value)
    if v == int(v):
        return f"{currency} {v:,.0f}"
    return f"{currency} {v:,.2f}"


async def _load_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> Tenant:
    tenant = await TenantRepository(db).get(tenant_id)
    if tenant is None:
        return Tenant(name="")
    return tenant


def _tenant_contact_lines(tenant: Tenant) -> list[str]:
    lines = []
    if tenant.address:
        lines.append(tenant.address)
    if tenant.city:
        city = tenant.city
        if tenant.country:
            city = f"{city}, {tenant.country}"
        lines.append(city)
    elif tenant.country:
        lines.append(tenant.country)
    if tenant.phone:
        lines.append(f"Tel: {tenant.phone}")
    if tenant.website:
        lines.append(tenant.website)
    return lines


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


def _logo_flowable(tenant: Tenant) -> Image | None:
    if not tenant.logo_url or not tenant.logo_url.startswith("/uploads/"):
        return None
    rel = tenant.logo_url[len("/uploads/"):]
    path = Path(settings.UPLOAD_DIR).resolve() / rel
    if not path.is_file():
        return None
    try:
        img = Image(str(path))
        ratio = img.imageWidth / img.imageHeight
    except (OSError, ValueError, TypeError):
        log.warning("sales.invoice_pdf.logo.skip", extra={"_extra_fields": {"path": str(path)}})
        return None
    if ratio >= 1:
        img.drawWidth = 20 * mm
        img.drawHeight = 20 * mm / ratio
    else:
        img.drawHeight = 20 * mm
        img.drawWidth = 20 * mm * ratio
    return img


def _status_chip(label: str, color: colors.Color, styles: dict) -> Table:
    t = Table([[Paragraph(esc(label.upper()), styles["status"])]], colWidths=[None])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), color),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


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


def _build_pdf(order: OrderRead, tenant: Tenant) -> bytes:
    accent = colors.HexColor(tenant.brand_color) if tenant.brand_color else colors.HexColor("#2563eb")
    currency = tenant.currency or "USD"
    styles = _styles(accent)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=16 * mm,
        title=f"Invoice {order.order_number} — {tenant.name or 'Company'}",
        author=tenant.name or "onegemmy",
    )
    flow: list = []

    # ── Header: logo/business info on the left, invoice number + status on the right
    logo = _logo_flowable(tenant)
    left_paras = [Paragraph(esc(tenant.name or "Your Business"), styles["company"])]
    left_paras += [Paragraph(esc(line), styles["contact"]) for line in _tenant_contact_lines(tenant)]
    left_cell = Table([[p] for p in left_paras], colWidths=[CONTENT_W * 0.55])
    left_cell.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))
    if logo:
        logo_and_name = Table([[logo, left_cell]], colWidths=[24 * mm, CONTENT_W * 0.55 - 24 * mm])
        logo_and_name.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        left_cell = logo_and_name

    right_paras = [
        Paragraph("INVOICE", styles["invoice_label"]),
        Paragraph(esc(order.order_number), styles["invoice_number"]),
        Spacer(1, 2 * mm),
        _status_chip(order.status, STATUS_COLORS.get(order.status, MUTED), styles),
    ]
    if order.status == "Completed":
        right_paras += [
            Spacer(1, 1.5 * mm),
            _status_chip(
                PAYMENT_STATUS_LABELS.get(order.payment_status, order.payment_status),
                PAYMENT_STATUS_COLORS.get(order.payment_status, MUTED), styles,
            ),
        ]
    right_cell = Table([[p] for p in right_paras], colWidths=[CONTENT_W * 0.45])
    right_cell.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))

    header = Table([[left_cell, right_cell]], colWidths=[CONTENT_W * 0.55, CONTENT_W * 0.45])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    flow.append(header)
    flow.append(Spacer(1, 4 * mm))
    flow.append(HRFlowable(width="100%", thickness=1.2, color=accent))
    flow.append(Spacer(1, 5 * mm))

    # ── Bill to / date issued
    bill_lines = [Paragraph("BILL TO", styles["h2"])]
    if order.customer:
        bill_lines.append(Paragraph(esc(order.customer.name), styles["body"]))
        if order.customer.email:
            bill_lines.append(Paragraph(esc(order.customer.email), styles["body_muted"]))
        if order.customer.phone:
            bill_lines.append(Paragraph(esc(order.customer.phone), styles["body_muted"]))
        if order.customer.address:
            bill_lines.append(Paragraph(esc(order.customer.address), styles["body_muted"]))
    else:
        bill_lines.append(Paragraph("Walk-in customer", styles["body"]))

    meta_lines = [Paragraph("DATE ISSUED", styles["h2"])]
    meta_lines.append(Paragraph(order.ordered_at.strftime("%d %b %Y, %H:%M") if order.ordered_at else "—", styles["body"]))
    if order.payment_method:
        meta_lines.append(Paragraph(f"Paid via {esc(order.payment_method)}", styles["body_muted"]))
    if order.due_date and order.outstanding_balance > 0:
        meta_lines.append(Paragraph(f"Due {order.due_date.strftime('%d %b %Y')}", styles["body_muted"]))

    bill_cell = Table([[p] for p in bill_lines], colWidths=[CONTENT_W * 0.55])
    meta_cell = Table([[p] for p in meta_lines], colWidths=[CONTENT_W * 0.45])
    for c in (bill_cell, meta_cell):
        c.setStyle(TableStyle([
            ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
        ]))
    bill_row = Table([[bill_cell, meta_cell]], colWidths=[CONTENT_W * 0.55, CONTENT_W * 0.45])
    bill_row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    flow.append(bill_row)
    flow.append(Spacer(1, 6 * mm))

    # ── Line items
    item_rows = []
    for item in order.items:
        if item.sku:
            name_flow = Table([[Paragraph(esc(item.product_name), styles["cell"])],
                                [Paragraph(esc(item.sku), styles["cell_muted"])]], colWidths=[None])
            name_flow.setStyle(TableStyle([
                ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]))
        else:
            name_flow = Paragraph(esc(item.product_name), styles["cell"])
        item_rows.append([
            name_flow,
            Paragraph(_qty(item.quantity), styles["cell"]),
            Paragraph(_fmt_money(item.unit_price, currency), styles["cell_right"]),
            Paragraph(_fmt_money(item.line_total, currency), styles["cell_right_bold"]),
        ])

    widths = [CONTENT_W * 0.46, CONTENT_W * 0.14, CONTENT_W * 0.20, CONTENT_W * 0.20]
    header_row = [
        Paragraph("ITEM", ParagraphStyle("ih", fontName=FONT_BOLD, fontSize=7.5, leading=10, textColor=colors.white)),
        Paragraph("QTY", ParagraphStyle("ih2", fontName=FONT_BOLD, fontSize=7.5, leading=10, textColor=colors.white)),
        Paragraph("UNIT PRICE", ParagraphStyle("ih3", fontName=FONT_BOLD, fontSize=7.5, leading=10, textColor=colors.white)),
        Paragraph("TOTAL", ParagraphStyle("ih4", fontName=FONT_BOLD, fontSize=7.5, leading=10, textColor=colors.white)),
    ]
    items_table = Table([header_row] + item_rows, colWidths=widths, repeatRows=1)
    items_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), accent),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    flow.append(items_table)
    flow.append(Spacer(1, 4 * mm))

    # ── Totals
    totals_rows = [["Subtotal", _fmt_money(order.subtotal, currency)]]
    if order.discount > 0:
        totals_rows.append(["Discount", f"-{_fmt_money(order.discount, currency)}"])
    totals_rows.append(["Tax", _fmt_money(order.tax, currency)])
    totals_data = [[Paragraph(esc(k), styles["body_muted"]), Paragraph(v, styles["cell_right"])] for k, v in totals_rows]
    totals_data.append([Paragraph("Total", styles["total_label"]), Paragraph(_fmt_money(order.total, currency), styles["total_value"])])
    totals_table = Table(totals_data, colWidths=[32 * mm, 32 * mm], hAlign="RIGHT")
    totals_table.setStyle(TableStyle([
        ("LINEABOVE", (0, -1), (-1, -1), 0.6, accent),
        ("TOPPADDING", (0, 0), (-1, -2), 2), ("BOTTOMPADDING", (0, 0), (-1, -2), 2),
        ("TOPPADDING", (0, -1), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    flow.append(totals_table)
    flow.append(Spacer(1, 6 * mm))

    # ── Payment summary (Completed orders only)
    if order.status == "Completed":
        pay_rows = [
            ["Total Paid", _fmt_money(order.amount_paid, currency)],
            ["Outstanding", _fmt_money(order.outstanding_balance, currency)],
        ]
        pay_data = [[Paragraph(esc(k), styles["body_muted"]), Paragraph(v, styles["cell_right_bold"])] for k, v in pay_rows]
        pay_table = Table(pay_data, colWidths=[40 * mm, 40 * mm], hAlign="RIGHT")
        pay_table.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
            ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]))
        flow.append(pay_table)
        flow.append(Spacer(1, 6 * mm))

    if order.notes:
        flow.append(Paragraph("NOTES", styles["h2"]))
        flow.append(Paragraph(esc(order.notes), styles["body_muted"]))
        flow.append(Spacer(1, 6 * mm))

    # ── QR + footer — a compact, honest order reference (no fabricated
    # tax-authority signature/SDC data; see generate_order_invoice_pdf docstring)
    qr_data = f"{tenant.name or ''}\nInvoice {order.order_number}\n{order.ordered_at.strftime('%Y-%m-%d %H:%M') if order.ordered_at else ''}\nTotal {_fmt_money(order.total, currency)}"
    qr = _qr_drawing(qr_data, 22)
    qr_cell = Table([[qr], [Paragraph("Order Reference", styles["footer_muted"])]], colWidths=[22 * mm])
    qr_cell.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    thanks_lines = [Paragraph(f"Thank you for your business{' — ' + esc(tenant.name) if tenant.name else ''}!", styles["footer_thanks"])]
    contact_bits = [b for b in (tenant.website, tenant.phone) if b]
    if contact_bits:
        thanks_lines.append(Paragraph(esc(" · ".join(contact_bits)), styles["footer_muted"]))
    thanks_cell = Table([[p] for p in thanks_lines], colWidths=[CONTENT_W - 22 * mm - 6 * mm])
    thanks_cell.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))
    footer_row = Table([[thanks_cell, qr_cell]], colWidths=[CONTENT_W - 22 * mm, 22 * mm])
    footer_row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEABOVE", (0, 0), (-1, 0), 0.6, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    flow.append(footer_row)

    def _page_footer(canvas, doc_):
        canvas.saveState()
        canvas.setFont(FONT, 7)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(PAGE_W - MARGIN, 10 * mm, f"Page {doc_.page}")
        canvas.restoreState()

    doc.build(flow, onFirstPage=_page_footer, onLaterPages=_page_footer)
    return buf.getvalue()


async def generate_order_invoice_pdf(db: AsyncSession, tenant_id: uuid.UUID, order_id: uuid.UUID) -> tuple[str, bytes]:
    """Renders an Order as a branded A4 invoice PDF.

    Deliberately does NOT include any Rwanda EBM/RRA-style tax-authority
    fields (SDC ID, cryptographic receipt signature, MRC) — those are only
    issued by a certified Sales Data Controller once a tenant has real EBM
    credentials, and fabricating them would misrepresent an uncertified
    invoice as tax-authority-verified. The QR code here only encodes a
    plain order reference, not a compliance signature.
    """
    order = await get_order(db, tenant_id, order_id)
    tenant = await _load_tenant(db, tenant_id)
    _register_fonts()
    pdf_bytes = _build_pdf(order, tenant)
    filename = f"invoice-{order.order_number}.pdf"
    return filename, pdf_bytes
