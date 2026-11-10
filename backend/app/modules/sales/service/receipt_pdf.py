"""Receipt as a PDF at the chosen paper: 80 mm or 58 mm till rolls, or A4, for Download and Share from the till.

Plain black text on white: no background fills, no rules or table lines, so it reads like a thermal receipt and prints
cleanly anywhere. The business's own identity on top (logo when it has one, name, contacts, TIN/VAT number); the page is
exactly as long as the receipt. Figures come from the saved sale, never recalculated.
"""
from __future__ import annotations

import io
import uuid
from datetime import UTC
from decimal import Decimal
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.brand_pdf import business_contact_lines, business_name, logo_flowable
from app.core.currency import format_money
from app.core.filenames import document_filename

PAPERS = {"80mm": 80 * mm, "58mm": 58 * mm, "A4": A4[0]}
A4_COLUMN = 120 * mm  # on A4 the receipt keeps a readable column, centred, instead of stretching across the sheet
METHODS = {"cash": "Cash", "mobile": "Mobile Money", "card": "Card", "bank": "Bank transfer", "credit": "Credit"}
BLACK = colors.black


def _styles(width: float) -> dict[str, ParagraphStyle]:
    size = 7.2 if width < 70 * mm else 8.2 if width < 100 * mm else 10
    base = ParagraphStyle("r", fontName="Helvetica", fontSize=size, leading=size * 1.32, textColor=BLACK)
    return {
        "body": base,
        "center": ParagraphStyle("c", parent=base, alignment=TA_CENTER),
        "biz": ParagraphStyle("b", parent=base, fontName="Helvetica-Bold", fontSize=size + 3, leading=(size + 3) * 1.25, alignment=TA_CENTER),
        "title": ParagraphStyle("t", parent=base, fontName="Helvetica-Bold", fontSize=size + 1.5, alignment=TA_CENTER, spaceBefore=4),
        "bold": ParagraphStyle("bo", parent=base, fontName="Helvetica-Bold"),
        "right": ParagraphStyle("rt", parent=base, alignment=TA_RIGHT),
        "rightbold": ParagraphStyle("rb", parent=base, fontName="Helvetica-Bold", alignment=TA_RIGHT),
        "total": ParagraphStyle("to", parent=base, fontName="Helvetica-Bold", fontSize=size + 2.5, leading=(size + 2.5) * 1.3),
        "totalright": ParagraphStyle("tr", parent=base, fontName="Helvetica-Bold", fontSize=size + 2.5, leading=(size + 2.5) * 1.3, alignment=TA_RIGHT),
        "left": ParagraphStyle("l", parent=base, alignment=TA_LEFT),
    }


def _rows(pairs, st, width, strong=False) -> Table:
    data = [[Paragraph(escape(k), st["bold" if strong else "body"]), Paragraph(escape(v), st["rightbold" if strong else "right"])] for k, v in pairs]
    t = Table(data, colWidths=[width * 0.55, width * 0.45])
    t.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                           ("TOPPADDING", (0, 0), (-1, -1), 0.6), ("BOTTOMPADDING", (0, 0), (-1, -1), 0.6), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return t


def build_receipt(order, tenant, paper: str = "80mm", cashier: str | None = None) -> bytes:
    page_w = PAPERS.get(paper, PAPERS["80mm"])
    sheet = paper == "A4"
    margin = (page_w - A4_COLUMN) / 2 if sheet else 4 * mm
    top = 18 * mm if sheet else margin
    width = page_w - 2 * margin - 12  # the page frame keeps 6 pt padding on each side
    st = _styles(page_w)
    currency = order.currency_code or getattr(tenant, "currency", None) or "RWF"
    money = lambda v: format_money(Decimal(str(v or 0)), currency)
    flow: list = []

    if getattr(tenant, "logo_url", None):
        logo = logo_flowable(tenant, 50 if sheet else min(34, width / mm), 22 if sheet else 14)
        if isinstance(logo, Image):  # the uploaded logo only; the coloured monogram fallback isn't printed on receipts
            logo.hAlign = "CENTER"
            flow += [logo, Spacer(1, 1.5 * mm)]
    flow.append(Paragraph(escape(business_name(tenant)), st["biz"]))
    flow += [Paragraph(escape(line), st["center"]) for line in business_contact_lines(tenant)]
    flow += [Spacer(1, 2 * mm), Paragraph("RECEIPT", st["title"]), Spacer(1, 1.5 * mm)]

    when = ""
    if order.ordered_at:
        try:
            zone = ZoneInfo(getattr(tenant, "timezone", None) or "UTC")
        except (ZoneInfoNotFoundError, ValueError):
            zone = ZoneInfo("UTC")
        at = order.ordered_at if order.ordered_at.tzinfo else order.ordered_at.replace(tzinfo=UTC)
        when = at.astimezone(zone).strftime("%d %b %Y, %H:%M")  # the business's local time, as on the till
    meta = [("Receipt", order.order_number), ("Date", when)]
    if cashier:
        meta.append(("Served by", cashier))
    if order.customer:
        meta.append(("Customer", order.customer.name))
        if getattr(order.customer, "tin", None):
            meta.append(("Customer TIN", order.customer.tin))
    flow += [_rows(meta, st, width), Spacer(1, 2.5 * mm)]

    for item in order.items:
        name = item.product_name + (" (" + ", ".join(f"{v}" for v in (item.variant_attributes or {}).values()) + ")" if item.variant_attributes else "")
        qty = Decimal(str(item.quantity)).normalize()
        flow.append(Paragraph(escape(name), st["bold"]))
        gross = Decimal(str(item.unit_price)) * Decimal(str(item.quantity))
        flow.append(_rows([(f"{qty:f} x {money(item.unit_price)}", money(gross))], st, width))
        if item.discount:
            flow.append(_rows([("  Discount", f"-{money(item.discount)}")], st, width))
        flow.append(Spacer(1, 1.2 * mm))

    flow.append(Spacer(1, 1.5 * mm))
    subtotal = order.original_subtotal if order.original_subtotal is not None else order.subtotal
    discount = order.total_discount if order.total_discount is not None else order.discount
    totals = [("Subtotal", money(subtotal))]
    if discount:
        totals.append(("Discount", f"-{money(discount)}"))
        for offer in order.discount_details or []:
            if isinstance(offer, dict) and offer.get("amount"):
                totals.append((f"  {offer.get('name') or 'Offer'}", f"-{money(offer.get('amount'))}"))
    if order.tax:
        exclusive = order.total > (Decimal(str(subtotal or 0)) - Decimal(str(discount or 0)) + Decimal("0.005"))
        totals.append(("VAT" if exclusive else "VAT included", money(order.tax)))
    flow.append(_rows(totals, st, width))
    total = Table([[Paragraph("TOTAL", st["total"]), Paragraph(escape(money(order.total)), st["totalright"])]], colWidths=[width * 0.45, width * 0.55])
    total.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 3)]))
    flow += [total, Spacer(1, 2 * mm)]

    pay = []
    taken = [p for p in order.payments or [] if not p.reversed_at]
    if len(taken) > 1:
        for p in taken:
            pay.append((METHODS.get(p.payment_method or "", p.payment_method or "Payment"), money(p.amount)))
    else:
        pay.append(("Payment", METHODS.get(order.payment_method or "", order.payment_method or "—")))
        if order.amount_tendered:
            pay.append(("Tendered", money(order.amount_tendered)))
    pay.append(("Paid", money(order.amount_paid)))
    if order.outstanding_balance and order.outstanding_balance > 0:
        pay.append(("Balance due", money(order.outstanding_balance)))
        if order.due_date:
            pay.append(("Due date", order.due_date.strftime("%d %b %Y")))
    elif order.change_due:
        pay.append(("Change", money(order.change_due)))
    flow += [_rows(pay, st, width), Spacer(1, 3 * mm), Paragraph("Thank you for your purchase!", st["center"])]

    # Measure the content so the page is exactly as long as the receipt (thermal paper has no fixed length).
    height = A4[1] if sheet else margin * 2 + sum(f.wrap(width, 10_000)[1] + getattr(f, "spaceBefore", 0) for f in flow) + 6 * mm
    out = io.BytesIO()
    doc = SimpleDocTemplate(out, pagesize=(page_w, height), leftMargin=margin, rightMargin=margin, topMargin=top, bottomMargin=top,
                            title=f"Receipt {order.order_number} - {business_name(tenant)}", author=business_name(tenant))
    doc.build(flow)
    return out.getvalue()


async def generate_order_receipt_pdf(db: AsyncSession, tenant_id: uuid.UUID, order_id: uuid.UUID, paper: str = "80mm") -> tuple[str, bytes]:
    from app.modules.sales.service.order import get_order
    from app.modules.tenants.models import User
    from app.modules.tenants.repository import TenantRepository

    order = await get_order(db, tenant_id, order_id)
    tenant = await TenantRepository(db).get(tenant_id)
    cashier = order.salesperson_name
    if not cashier and order.created_by:
        user = await db.get(User, order.created_by)
        cashier = user.full_name if user and user.tenant_id == tenant_id else None
    pdf = build_receipt(order, tenant, paper, cashier)
    return document_filename(tenant.name if tenant else None, "Receipt", "pdf", reference=order.order_number), pdf
