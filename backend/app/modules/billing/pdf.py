from decimal import Decimal
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def invoice_pdf(invoice: dict, decimals: int, receipt: dict | None = None) -> bytes:
    out = BytesIO()
    doc = SimpleDocTemplate(
        out,
        pagesize=(210 * mm, 297 * mm),
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )
    styles = getSampleStyleSheet()

    def p(text: object, style: str = "Normal") -> Paragraph:
        return Paragraph(escape(str(text)), styles[style])

    def money(amount: int) -> str:
        return f"{invoice['currency']} {Decimal(amount) / (10**decimals):,.{decimals}f}"

    title = invoice.get("document_title", "PAYMENT RECEIPT" if receipt else "SUBSCRIPTION INVOICE")
    content = [
        p("PESAA", "Title"),
        p(title, "Heading2"),
        Spacer(1, 8 * mm),
        p(invoice["number"], "Heading2"),
        p(invoice.get("tenant_name", "")),
        p(f"Issued: {invoice['created_at']:%d %b %Y} UTC"),
        p(f"Due: {invoice['due_at']:%d %b %Y} UTC"),
        p(f"Billing period: {invoice['period_start']:%d %b %Y} - {invoice['period_end']:%d %b %Y}"),
        p(f"Status: {invoice['status'].replace('_', ' ').title()}"),
        Spacer(1, 8 * mm),
    ]
    rows = [[p("Description"), p("Amount")]]
    rows += [[p(line["description"]), p(money(line["amount"]))] for line in invoice["lines"]]
    for label, amount in (
        ("Subtotal", invoice["subtotal"]),
        ("Tax", invoice["tax"]),
        ("Total", invoice["total"]),
        ("Paid", invoice["paid"]),
        ("Outstanding", invoice["total"] - invoice["paid"]),
    ):
        rows.append([p(label), p(money(amount))])
    table = Table(rows, colWidths=[115 * mm, 55 * mm], repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eaf7ee")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.HexColor("#16a34a")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    content.append(table)
    if receipt:
        content.extend(
            [
                Spacer(1, 8 * mm),
                p(f"Verified payment: {receipt['reference']}"),
                p(f"Received: {money(receipt['amount'])}"),
                p("Provider: pawaPay"),
            ]
        )
    content.extend(
        [Spacer(1, 10 * mm), p("All amounts are in the invoice currency. Dates are shown in UTC.")]
    )
    doc.build(content)
    return out.getvalue()
