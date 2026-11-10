"""The printed quotation: a business letterhead, the document box, the customer, priced lines with unit and VAT %, totals, the
business's standing terms (bank details, validity) and signature lines."""
import uuid
from datetime import UTC, datetime
from xml.sax.saxutils import escape as esc

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.brand_pdf import (
    brand_color,
    business_name,
    draw_brand_band,
    logo_flowable,
    readable_on,
)
from app.core.filenames import document_filename
from app.modules.accounting.service.tax import get_effective_vat_rate, is_vat_enabled
from app.modules.inventory.models.product import Product
from app.modules.sales.service.invoice_pdf import (
    CONTENT_W,
    FONT,
    FOREGROUND,
    MARGIN,
    MUTED,
    PAGE_W,
    _fmt_money,
    _load_tenant,
    _qr_drawing,
    _qty,
    _register_fonts,
    _styles,
    _tenant_contact_lines,
)
from app.modules.sales.service.quotation import get_quotation
from app.modules.tenants.models import Tenant, User

RULE = colors.HexColor("#9ca3af")


def _page(tenant, accent):
    """On every page: the brand band at the top, and at the foot the signature line, the company's own details and the page number."""
    line = "  ·  ".join(x for x in (tenant.name, getattr(tenant, "website", None), getattr(tenant, "email", None), getattr(tenant, "phone", None)) if x)

    def draw(canvas, doc):
        canvas.saveState()
        draw_brand_band(canvas, PAGE_W, A4[1], accent)
        canvas.setStrokeColor(accent)
        canvas.setLineWidth(0.8)
        canvas.line(MARGIN, 16 * mm, PAGE_W - MARGIN, 16 * mm)
        canvas.setFont(FONT, 7.5)
        canvas.setFillColor(FOREGROUND)
        canvas.drawString(MARGIN, 12 * mm, "Authorized Signature :______________________________      Received By: _________________      Date : ____ / ____ / 20 __")
        canvas.setFillColor(MUTED)
        canvas.drawString(MARGIN, 7 * mm, line[:120])
        canvas.drawRightString(PAGE_W - MARGIN, 7 * mm, f"Page {doc.page}")
        canvas.restoreState()
    return draw


def _build(q, tenant: Tenant, seller: str | None, units: dict, vat_rate: float, accent) -> bytes:
    import io
    st = _styles(accent)
    cur = tenant.currency or "USD"
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=12 * mm, bottomMargin=22 * mm,
                            title=f"Sales Quotation {q.quote_number} — {tenant.name or 'Company'}", author=business_name(tenant))
    label = st["contact"]
    key = lambda text: Paragraph(f'<font color="#6b7280">{esc(text)}</font>', st["cell"])
    val = lambda text, bold=False: Paragraph(esc(str(text)), st["cell_right_bold" if bold else "cell"])

    # Letterhead: business on the left, a QR of the document reference in the middle, the document box on the right.
    name_style = ParagraphStyle("brand_name", parent=st["company"], textColor=accent, fontSize=16, leading=19)
    business = [logo_flowable(tenant, 46, 22), Spacer(1, 2 * mm), Paragraph(esc(tenant.name or "Company"), name_style)] + [Paragraph(esc(line), label) for line in _tenant_contact_lines(tenant)]
    qr = _qr_drawing(f"{tenant.name or ''}\nQuotation {q.quote_number}\nTotal {_fmt_money(q.total, cur)}", 26)
    box = Table([
        [key("Document No. :"), Paragraph(f"<b>{esc(q.quote_number)}</b>", st["cell"])],
        [key("Document Date :"), val(q.issue_date.strftime("%d-%b-%Y"))],
        [key("Valid until :"), val(q.expiry_date.strftime("%d-%b-%Y") if q.expiry_date else "—")],
        [key("Sales Employee"), val(seller or "—")],
        [key("Document Currency"), val(f"{cur}   Rate 1.00")],
    ], colWidths=[34 * mm, 38 * mm])
    box.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -2), 0.4, RULE, None, (1, 2)), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    title_style = ParagraphStyle("brand_title", parent=st["company"], textColor=accent, fontSize=20, leading=24, alignment=2)
    title = Table([[Paragraph("Sales Quotation", title_style)]], colWidths=[72 * mm])
    title.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 1.6, accent), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    right = Table([[title], [box]], colWidths=[72 * mm])
    head = Table([[business, qr, right]], colWidths=[CONTENT_W - 72 * mm - 30 * mm, 30 * mm, 72 * mm])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))

    c = q.customer
    who = [Paragraph("<b>Customer Details:</b>", st["cell"])]
    if c:
        who += [Paragraph(esc(c.name), st["cell"])] + [Paragraph(esc(x), st["cell_muted"]) for x in (c.phone, c.email, c.address) if x]
    ids = Table([[key("Customer TIN :"), val(c.tin if c and c.tin else "—")],
                 [key("Print Date & Time"), val(datetime.now(UTC).strftime("%d/%m/%Y %H:%M"))]], colWidths=[34 * mm, 38 * mm])
    meta = Table([[who, ids]], colWidths=[CONTENT_W - 72 * mm, 72 * mm])
    meta.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))

    on_brand = readable_on(accent)
    head_left = ParagraphStyle("th_l", parent=st["cell"], textColor=on_brand, fontName="Helvetica-Bold")
    head_right = ParagraphStyle("th_r", parent=head_left, alignment=2)
    rows = [[Paragraph(h, head_right if n >= 3 else head_left) for n, h in enumerate(("#", "Item", "Unit", "Quantity", "Vat %", "Rate", "Line Total"))]]
    for n, i in enumerate(q.items, 1):
        name = (f"{esc(i.sku)}: " if i.sku else "") + esc(i.product_name)
        rows.append([Paragraph(str(n), st["cell"]), Paragraph(name, st["cell"]), Paragraph(esc(units.get(i.product_id, "")), st["cell"]),
                     Paragraph(_qty(i.quantity), st["cell_right"]), Paragraph(f"{vat_rate:.2f}", st["cell_right"]),
                     Paragraph(_fmt_money(i.unit_price, cur), st["cell_right"]), Paragraph(_fmt_money(i.line_total, cur), st["cell_right"])])
    lines = Table(rows, colWidths=[8 * mm, None, 16 * mm, 20 * mm, 14 * mm, 28 * mm, 30 * mm], repeatRows=1)
    lines.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), accent),
                               ("LINEBELOW", (0, -1), (-1, -1), 0.4, RULE, None, (1, 2)), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                               ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4)]))

    net = round(float(q.total) - float(q.tax), 2)
    sums = [[key("NET " + cur + " :"), val(_fmt_money(net, cur))], [key("VAT " + cur + " :"), val(_fmt_money(q.tax, cur))]]
    if float(q.discount):
        sums.insert(0, [key("DISCOUNT :"), val(_fmt_money(q.discount, cur))])
    total_label = ParagraphStyle("tot_l", parent=st["cell"], textColor=on_brand, fontName="Helvetica-Bold")
    total_value = ParagraphStyle("tot_v", parent=total_label, alignment=2)
    sums.append([Paragraph(esc("TOTAL " + cur), total_label), Paragraph(esc(_fmt_money(q.total, cur)), total_value)])
    totals = Table(sums, colWidths=[28 * mm, 34 * mm])
    totals.setStyle(TableStyle([("BACKGROUND", (0, -1), (-1, -1), accent), ("TEXTCOLOR", (0, -1), (-1, -1), on_brand), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    remarks = [Paragraph(f"Remarks : {esc(q.notes)}" if q.notes else "Remarks :", st["cell"])]
    below = Table([[remarks, totals]], colWidths=[CONTENT_W - 62 * mm, 62 * mm])
    below.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))

    flow = [head, Spacer(1, 4 * mm), meta, Spacer(1, 4 * mm), lines, Spacer(1, 2 * mm), below, Spacer(1, 6 * mm)]
    if q.terms:
        flow += [Paragraph(esc(line) or "&nbsp;", st["cell"]) for line in q.terms.splitlines()]
    doc.build(flow, onFirstPage=_page(tenant, accent), onLaterPages=_page(tenant, accent))
    return buf.getvalue()


async def generate_quotation_pdf(db: AsyncSession, tenant_id: uuid.UUID, quotation_id: uuid.UUID) -> tuple[str, bytes]:
    q = await get_quotation(db, tenant_id, quotation_id)
    tenant = await _load_tenant(db, tenant_id)
    ids = [i.product_id for i in q.items if i.product_id]
    units = {}
    if ids:
        for p in (await db.execute(select(Product).where(Product.tenant_id == tenant_id, Product.id.in_(ids)))).unique().scalars():
            units[p.id] = (p.unit.abbreviation or p.unit.name) if p.unit else ""
    seller = q.salesperson_name
    if seller is None and q.created_by:
        seller = (await db.get(User, q.created_by)).full_name
    rate = float(await get_effective_vat_rate(db, tenant_id)) if await is_vat_enabled(db, tenant_id) else 0.0
    accent = brand_color(tenant)
    _register_fonts()
    return document_filename(tenant.name, "Quotation", "pdf", reference=q.quote_number), _build(q, tenant, seller, units, rate, accent)
