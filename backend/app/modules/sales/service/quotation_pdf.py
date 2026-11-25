"""The printed quotation: the same A4 document as the business's invoice (header, party block, items table, VAT summary, totals and
the receipt's closing, all from invoice_pdf), with what only a quotation has: its validity, its terms and the acceptance lines.
Printed in black, like the invoice. Only real data is printed; an empty field leaves no line behind."""
import asyncio
import io
import uuid
from xml.sax.saxutils import escape as esc

from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import HRFlowable, KeepTogether, Paragraph, Spacer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.brand_pdf import business_name
from app.core.filenames import document_filename
from app.modules.inventory.models.product import Product
from app.modules.sales.schemas.quotation import QuotationRead
from app.modules.sales.service.invoice_pdf import (
    CONTENT_W,
    FOREGROUND,
    INVOICE_INK,
    TOTALS_W,
    _box,
    _closing,
    _doc_header,
    _doc_styles,
    _fmt_money,
    _items_table,
    _load_tenant,
    _lower_section,
    _new_doc,
    _party_block,
    _register_fonts,
    _top_rule,
    _totals_rows,
    _totals_style,
    _vat_side,
)
from app.modules.sales.service.quotation import get_quotation
from app.modules.tenants.models import Tenant, User

DATE = "%d %b %Y"


def _terms(q: QuotationRead, tenant: Tenant) -> str:
    """The quotation's own terms (a new quotation starts from the business's standing terms), else the standing terms."""
    return (q.terms or "").strip() or (getattr(tenant, "quotation_terms", None) or "").strip()


def _acceptance(s: dict, issuer: str) -> list:
    """Two signature lines side by side: the business, and the customer accepting the offer."""
    gap = 12 * mm
    col = (CONTENT_W - gap) / 2

    def signer(caption: str) -> list:
        return [[Paragraph(esc(caption.upper()), s["cap"])], [Spacer(1, 10 * mm)],
                [HRFlowable(width=col, thickness=0.6, color=FOREGROUND, spaceAfter=0, spaceBefore=0)], [Spacer(1, 1.5 * mm)],
                [Paragraph("Name, signature &amp; date", s["small"])]]

    return [_box([[_box(signer(f"For {issuer}"), [col]), Spacer(gap, 1), _box(signer("Accepted by customer"), [col])]], [col, gap, col]),
            Spacer(1, 6 * mm)]


def _build(q: QuotationRead, tenant: Tenant, prepared_by: str | None, units: dict) -> bytes:
    accent = colors.HexColor(INVOICE_INK)  # black only, like the invoice
    currency = tenant.currency or "USD"  # a quotation is priced in the business's own currency
    m = lambda v: _fmt_money(v, currency)
    issuer = business_name(tenant)
    s = _doc_styles(accent)
    buf = io.BytesIO()
    doc = _new_doc(buf, f"Quotation {q.quote_number} — {issuer}", issuer)

    flow: list = _doc_header(tenant, s, "Quotation", q.quote_number, [(q.status.upper(), accent)])

    meta: list[tuple[str, str]] = [("Issue date", q.issue_date.strftime(DATE))]
    if q.expiry_date:
        meta.append(("Valid until", q.expiry_date.strftime(DATE)))
    meta.append(("Currency", currency))
    if prepared_by:
        meta.append(("Prepared by", prepared_by))
    if q.converted_order_number:
        meta.append(("Converted to", q.converted_order_number))
    flow += _party_block(s, "Quote to", q.customer, "No customer selected", meta)

    items_flow, show_tax = _items_table(q.items, s, m, tenant, units=units, show_variants=True)
    flow += items_flow

    # ── Left: VAT summary and notes. Right: the totals (a quotation has no payments, so no balance).
    side = _vat_side(q, s, m)
    if (q.notes or "").strip():
        side += [[Paragraph("NOTES", s["cap"])], [Spacer(1, 1.5 * mm)], [Paragraph(esc(q.notes.strip()).replace("\n", "<br/>"), s["body"])]]
    tot, grand_at = _totals_rows(q, s, m, tenant, show_tax, "Total")
    flow += _lower_section(side, _box(tot, [TOTALS_W * 0.48, TOTALS_W * 0.52], _totals_style(grand_at)))

    # Validity and terms, aligned with the boxes above (one row each so a long text can still run onto the next page)
    rows: list = []
    if q.expiry_date:
        rows += [[Paragraph(f"This quotation is valid until <b>{q.expiry_date.strftime(DATE)}</b>.", s["body"])], [Spacer(1, 5 * mm)]]
    terms = _terms(q, tenant)
    if terms:
        rows += [[Paragraph("TERMS", s["cap"])], [Spacer(1, 1.5 * mm)]]
        rows += [[Paragraph(esc(line), s["body"]) if line.strip() else Spacer(1, 2.5 * mm)] for line in terms.splitlines()]
        rows.append([Spacer(1, 7 * mm)])
    if rows:
        flow.append(_box(rows, [CONTENT_W]))

    # The signatures and the closing stay together, so the closing never sits alone on a page
    flow.append(KeepTogether(_acceptance(s, issuer) + _closing(tenant)))
    doc.build(flow, onFirstPage=_top_rule(accent), onLaterPages=_top_rule(accent))
    return buf.getvalue()


async def generate_quotation_pdf(db: AsyncSession, tenant_id: uuid.UUID, quotation_id: uuid.UUID) -> tuple[str, bytes]:
    q = await get_quotation(db, tenant_id, quotation_id)
    tenant = await _load_tenant(db, tenant_id)
    ids = [i.product_id for i in q.items if i.product_id]
    units = {}
    if ids:
        for p in (await db.execute(select(Product).where(Product.tenant_id == tenant_id, Product.id.in_(ids)))).unique().scalars():
            units[p.id] = (p.unit.abbreviation or p.unit.name) if p.unit else ""
    prepared_by = q.salesperson_name
    if prepared_by is None and q.created_by:
        creator = await db.get(User, q.created_by)
        prepared_by = creator.full_name if creator else None
    _register_fonts()
    # built in a worker thread: generating the file is CPU work and must not hold up other people's requests
    content = await asyncio.to_thread(_build, q, tenant, prepared_by, units)
    return document_filename(tenant.name, "Quotation", "pdf", reference=q.quote_number), content
