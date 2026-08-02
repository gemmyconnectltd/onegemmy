import csv
import io
import uuid
from datetime import UTC, datetime
from pathlib import Path
from xml.sax.saxutils import escape as esc

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
from app.modules.inventory.service.valuation import inventory_valuation
from app.modules.tenants.models import Tenant
from app.modules.tenants.repository import TenantRepository

log = get_logger("inventory.export")

ACCENT = colors.HexColor("#059669")
ACCENT_LIGHT = colors.HexColor("#34d399")
FOREGROUND = colors.HexColor("#111827")
MUTED = colors.HexColor("#6b7280")
BORDER = colors.HexColor("#e5e7eb")
CARD_BG = colors.HexColor("#f9fafb")

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm
CONTENT_W = PAGE_W - 2 * MARGIN

CURRENCY = "RWF"


def _fmt_money(value: float) -> str:
    v = float(value)
    if v == int(v):
        return f"{CURRENCY} {v:,.0f}"
    return f"{CURRENCY} {v:,.2f}"


def _fmt_qty(value: int) -> str:
    return f"{value:,}"


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


# ── CSV ─────────────────────────────────────────────────────────────────────

def _export_csv(report, tenant: Tenant) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)

    if tenant.name:
        w.writerow([tenant.name])
    for line in _tenant_contact_lines(tenant):
        w.writerow([line])
    w.writerow([])
    w.writerow(["Inventory Valuation Report"])
    w.writerow([f"Generated: {report.generated_at.replace('+00:00', 'Z').replace('T', ' ')}"])
    w.writerow(["Costing method: unit cost"])

    s = report.summary
    w.writerow([])
    w.writerow(["SUMMARY"])
    w.writerow(["Metric", "Value"])
    w.writerow(["Tracked Lines", s.line_count])
    w.writerow(["Products", s.product_count])
    w.writerow(["Variants", s.variant_count])
    w.writerow(["Total Units", s.total_units])
    w.writerow(["Stock Value (Cost)", _fmt_money(s.cost_value)])
    w.writerow(["Retail Value", _fmt_money(s.retail_value)])
    w.writerow(["Potential Margin", _fmt_money(s.margin)])
    w.writerow(["Low Stock Lines", s.low_stock_count])
    w.writerow(["Out of Stock Lines", s.out_of_stock_count])

    w.writerow([])
    w.writerow(["STOCK VALUE BY CATEGORY"])
    w.writerow(["Category", "Units", "Stock Value", "Retail Value", "Margin"])
    for c in report.categories:
        w.writerow([c.name, c.units, _fmt_money(c.cost_value), _fmt_money(c.retail_value), _fmt_money(c.margin)])

    w.writerow([])
    w.writerow(["INVENTORY VALUATION"])
    w.writerow(["Item", "Kind", "SKU", "Category", "Qty", "Unit Cost", "Stock Value", "Retail Value", "Margin", "Status"])
    for l in report.lines:
        w.writerow([l.name, l.kind, l.sku or "", l.category or "", l.stock, _fmt_money(l.cost), _fmt_money(l.cost_value), _fmt_money(l.retail_value), _fmt_money(l.margin), l.status.upper()])

    w.writerow([])
    w.writerow(["TOTAL", "", "", "", s.total_units, "", _fmt_money(s.cost_value), _fmt_money(s.retail_value), _fmt_money(s.margin), ""])

    return buf.getvalue().encode("utf-8-sig")


# ── PDF ─────────────────────────────────────────────────────────────────────

FONT = "Helvetica"
FONT_BOLD = "Helvetica-Bold"


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
        log.warning("inventory.export.fonts.skip", extra={"_extra_fields": {"path": str(fonts_dir)}})
        return
    FONT = "App"
    FONT_BOLD = "App-Bold"


def _styles() -> dict:
    return {
        "company": ParagraphStyle("company", fontName=FONT_BOLD, fontSize=18, leading=22, textColor=FOREGROUND),
        "contact": ParagraphStyle("contact", fontName=FONT, fontSize=8.5, leading=12, textColor=MUTED, alignment=1),
        "title": ParagraphStyle("title", fontName=FONT_BOLD, fontSize=16, leading=20, textColor=FOREGROUND),
        "subtitle": ParagraphStyle("subtitle", fontName=FONT, fontSize=9, leading=13, textColor=MUTED),
        "note": ParagraphStyle("note", fontName=FONT, fontSize=8, leading=11, textColor=MUTED),
        "h2": ParagraphStyle("h2", fontName=FONT_BOLD, fontSize=12, leading=15, textColor=FOREGROUND, spaceBefore=10, spaceAfter=6),
        "cell": ParagraphStyle("cell", fontName=FONT, fontSize=8, leading=10.5, textColor=FOREGROUND),
        "cell_muted": ParagraphStyle("cell_muted", fontName=FONT, fontSize=8, leading=10.5, textColor=MUTED),
        "cell_bold": ParagraphStyle("cell_bold", fontName=FONT_BOLD, fontSize=8, leading=10.5, textColor=FOREGROUND),
        "cell_right": ParagraphStyle("cell_right", fontName=FONT, fontSize=8, leading=10.5, textColor=FOREGROUND, alignment=2),
        "cell_right_bold": ParagraphStyle("cell_right_bold", fontName=FONT_BOLD, fontSize=8, leading=10.5, textColor=FOREGROUND, alignment=2),
        "kpi_label": ParagraphStyle("kpi_label", fontName=FONT_BOLD, fontSize=7, leading=9, textColor=MUTED),
        "kpi_value": ParagraphStyle("kpi_value", fontName=FONT_BOLD, fontSize=12, leading=15, textColor=FOREGROUND),
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
        log.warning("inventory.export.logo.skip", extra={"_extra_fields": {"path": str(path)}})
        return None
    if ratio >= 1:
        img.drawWidth = 34 * mm
        img.drawHeight = 34 * mm / ratio
    else:
        img.drawHeight = 18 * mm
        img.drawWidth = 18 * mm * ratio
    return img


def _kpi_table(report, styles: dict) -> Table:
    s = report.summary
    cells = [
        ["Stock Value (Cost)", "Retail Value", "Potential Margin", "Total Units", "Low / Out of Stock"],
        [
            _fmt_money(s.cost_value),
            _fmt_money(s.retail_value),
            _fmt_money(s.margin),
            _fmt_qty(s.total_units),
            f"{s.low_stock_count} / {s.out_of_stock_count}",
        ],
    ]
    table = Table(cells, colWidths=[CONTENT_W / 5] * 5, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 1), (-1, 1), CARD_BG),
        ("BOX", (0, 0), (-1, -1), 0.75, BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.75, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
    ]))
    for i, label in enumerate(cells[0]):
        table._cellvalues[0][i] = Paragraph(label, styles["kpi_label"])
        table._cellvalues[1][i] = Paragraph(cells[1][i], styles["kpi_value"])
    return table


def _data_table(header: list[str], rows: list[list], widths: list[float], styles: dict, repeat_header: bool = True) -> Table:
    styled_rows = [header] + rows
    table = Table(styled_rows, colWidths=widths, hAlign="LEFT", repeatRows=1 if repeat_header else 0)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.75, BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for c, header_text in enumerate(header):
        style_cmds.append(("BACKGROUND", (c, 0), (c, 0), ACCENT))
        table._cellvalues[0][c] = Paragraph(header_text, ParagraphStyle("hdr", fontName=FONT_BOLD, fontSize=7.5, leading=10, textColor=colors.white))
    table.setStyle(TableStyle(style_cmds))
    return table


def _build_pdf(report, tenant: Tenant, styles: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=18 * mm,
        title=f"Inventory Valuation Report — {tenant.name or 'Company'}",
        author=tenant.name or "OneGemmy",
    )

    flow: list = []

    # ── Branded header ──
    logo = _logo_flowable(tenant)
    contact_paras = [Paragraph(esc(tenant.name or "Company Name"), styles["company"])]
    contact_paras += [Paragraph(esc(line), styles["contact"]) for line in _tenant_contact_lines(tenant)]
    right_cell = Table([[p] for p in contact_paras], colWidths=[CONTENT_W - 60 * mm])
    right_cell.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    header_table = Table(
        [[logo, right_cell]] if logo else [["", right_cell]],
        colWidths=[60 * mm, CONTENT_W - 60 * mm],
        hAlign="LEFT",
    )
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    flow.append(header_table)
    flow.append(Spacer(1, 4 * mm))
    flow.append(HRFlowable(width="100%", thickness=1.2, color=ACCENT))
    flow.append(Spacer(1, 6 * mm))

    # ── Title ──
    flow.append(Paragraph("Inventory Valuation Report", styles["title"]))
    flow.append(Spacer(1, 2 * mm))
    flow.append(Paragraph(
        f"Generated on {report.generated_at[:10]} · {report.summary.line_count} tracked lines · "
        f"{report.summary.total_units:,} units on hand · Costing method: unit cost",
        styles["subtitle"],
    ))
    flow.append(Spacer(1, 3 * mm))

    # ── KPIs ──
    flow.append(_kpi_table(report, styles))
    flow.append(Spacer(1, 4 * mm))

    # ── Category table ──
    flow.append(Paragraph("Stock Value by Category", styles["h2"]))
    cat_rows = [
        [Paragraph(esc(c.name), styles["cell"]), Paragraph(_fmt_qty(c.units), styles["cell_right"]),
         Paragraph(_fmt_money(c.cost_value), styles["cell_right"]),
         Paragraph(_fmt_money(c.retail_value), styles["cell_right"]),
         Paragraph(_fmt_money(c.margin), styles["cell_right"])]
        for c in report.categories
    ]
    flow.append(_data_table(
        ["Category", "Units", "Stock Value", "Retail Value", "Margin"],
        cat_rows,
        [CONTENT_W * 0.28, CONTENT_W * 0.13, CONTENT_W * 0.20, CONTENT_W * 0.20, CONTENT_W * 0.19],
        styles,
        repeat_header=False,
    ))

    # ── Valuation table ──
    flow.append(Paragraph("Inventory Valuation", styles["h2"]))
    val_rows = []
    for l in report.lines:
        val_rows.append([
            Paragraph(esc(l.name), styles["cell"]),
            Paragraph(esc(l.sku or "—"), styles["cell_muted"]),
            Paragraph(esc(l.category or "—"), styles["cell_muted"]),
            Paragraph(_fmt_qty(l.stock), styles["cell_right"]),
            Paragraph(_fmt_money(l.cost), styles["cell_right"]),
            Paragraph(_fmt_money(l.cost_value), styles["cell_right_bold"]),
            Paragraph(_fmt_money(l.retail_value), styles["cell_right"]),
            Paragraph(_fmt_money(l.margin), styles["cell_right"]),
        ])
    val_rows.append([
        Paragraph("Total", ParagraphStyle("tot", fontName=FONT_BOLD, fontSize=8.5, leading=11, textColor=FOREGROUND)),
        Paragraph("", styles["cell"]), Paragraph("", styles["cell"]),
        Paragraph(_fmt_qty(report.summary.total_units), styles["cell_right_bold"]),
        Paragraph("", styles["cell"]),
        Paragraph(_fmt_money(report.summary.cost_value), styles["cell_right_bold"]),
        Paragraph(_fmt_money(report.summary.retail_value), styles["cell_right_bold"]),
        Paragraph(_fmt_money(report.summary.margin), styles["cell_right_bold"]),
    ])
    widths = [CONTENT_W * 0.30, CONTENT_W * 0.13, CONTENT_W * 0.13, CONTENT_W * 0.08, CONTENT_W * 0.11, CONTENT_W * 0.13, CONTENT_W * 0.13, CONTENT_W * 0.12]
    table = _data_table(
        ["Item", "SKU", "Category", "Qty", "Unit Cost", "Stock Value", "Retail Value", "Margin"],
        val_rows,
        widths,
        styles,
    )
    table.setStyle(TableStyle([("BACKGROUND", (0, -1), (-1, -1), CARD_BG)]))
    flow.append(table)

    def _footer(canvas, doc_):
        canvas.saveState()
        canvas.setStrokeColor(BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, 14 * mm, PAGE_W - MARGIN, 14 * mm)
        canvas.setFont(FONT, 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(MARGIN, 10 * mm, f"{tenant.name or 'OneGemmy'} · Inventory Valuation Report")
        canvas.drawRightString(PAGE_W - MARGIN, 10 * mm, f"Page {doc_.page}")
        canvas.restoreState()

    doc.build(flow, onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue()


async def export_valuation_report(db: AsyncSession, tenant_id: uuid.UUID, fmt: str) -> tuple[str, bytes, str]:
    report = await inventory_valuation(db, tenant_id)
    tenant = await _load_tenant(db, tenant_id)

    day = datetime.now(UTC).strftime("%Y-%m-%d")
    base_name = f"inventory-valuation-{day}"

    if fmt == "csv":
        return f"{base_name}.csv", _export_csv(report, tenant), "text/csv; charset=utf-8"

    _register_fonts()
    return f"{base_name}.pdf", _build_pdf(report, tenant, _styles()), "application/pdf"
