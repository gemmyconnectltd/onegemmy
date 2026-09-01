import csv
import io
import uuid
from datetime import UTC, date, datetime
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
from app.modules.accounting import service as accounting_service
from app.modules.accounting.schemas.report import (
    BalanceSheet,
    CashFlowStatement,
    GeneralLedger,
    IncomeStatement,
    StatementLine,
    TrialBalance,
)
from app.modules.tenants.models import Tenant
from app.modules.tenants.repository import TenantRepository

log = get_logger("accounting.export")

ACCENT = colors.HexColor("#b45309")
ACCENT_LIGHT = colors.HexColor("#fbbf24")
FOREGROUND = colors.HexColor("#111827")
MUTED = colors.HexColor("#6b7280")
BORDER = colors.HexColor("#e5e7eb")
CARD_BG = colors.HexColor("#f9fafb")

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm
CONTENT_W = PAGE_W - 2 * MARGIN

CURRENCY = "RWF"

FONT = "Helvetica"
FONT_BOLD = "Helvetica-Bold"


def _fmt_money(value: float) -> str:
    v = float(value)
    if v == int(v):
        return f"{CURRENCY} {v:,.0f}"
    return f"{CURRENCY} {v:,.2f}"


def _fmt_pct(value: float | None) -> str:
    if value is None:
        return "—"
    return f"{value:.1f}%"


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


# ── Shared branding helpers ────────────────────────────────────────────────

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
        log.warning("accounting.export.fonts.skip", extra={"_extra_fields": {"path": str(fonts_dir)}})
        return
    FONT = "App"
    FONT_BOLD = "App-Bold"


def _styles() -> dict:
    return {
        "company": ParagraphStyle("company", fontName=FONT_BOLD, fontSize=18, leading=22, textColor=FOREGROUND),
        "contact": ParagraphStyle("contact", fontName=FONT, fontSize=8.5, leading=12, textColor=MUTED, alignment=1),
        "title": ParagraphStyle("title", fontName=FONT_BOLD, fontSize=16, leading=20, textColor=FOREGROUND),
        "subtitle": ParagraphStyle("subtitle", fontName=FONT, fontSize=9, leading=13, textColor=MUTED),
        "h2": ParagraphStyle("h2", fontName=FONT_BOLD, fontSize=12, leading=15, textColor=FOREGROUND, spaceBefore=10, spaceAfter=6),
        "cell": ParagraphStyle("cell", fontName=FONT, fontSize=8, leading=10.5, textColor=FOREGROUND),
        "cell_muted": ParagraphStyle("cell_muted", fontName=FONT, fontSize=8, leading=10.5, textColor=MUTED),
        "cell_bold": ParagraphStyle("cell_bold", fontName=FONT_BOLD, fontSize=8, leading=10.5, textColor=FOREGROUND),
        "cell_right": ParagraphStyle("cell_right", fontName=FONT, fontSize=8, leading=10.5, textColor=FOREGROUND, alignment=2),
        "cell_right_bold": ParagraphStyle("cell_right_bold", fontName=FONT_BOLD, fontSize=8, leading=10.5, textColor=FOREGROUND, alignment=2),
        "kpi_label": ParagraphStyle("kpi_label", fontName=FONT_BOLD, fontSize=7, leading=9, textColor=MUTED),
        "kpi_value": ParagraphStyle("kpi_value", fontName=FONT_BOLD, fontSize=12, leading=15, textColor=FOREGROUND),
        "tot_left": ParagraphStyle("tot_left", fontName=FONT_BOLD, fontSize=8.5, leading=11, textColor=FOREGROUND),
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
        log.warning("accounting.export.logo.skip", extra={"_extra_fields": {"path": str(path)}})
        return None
    if ratio >= 1:
        img.drawWidth = 34 * mm
        img.drawHeight = 34 * mm / ratio
    else:
        img.drawHeight = 18 * mm
        img.drawWidth = 18 * mm * ratio
    return img


def _start_pdf(tenant: Tenant, styles: dict, title: str, subtitle: str, footer_label: str) -> tuple[SimpleDocTemplate, list]:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=18 * mm,
        title=f"{title} — {tenant.name or 'Company'}",
        author=tenant.name or "OneGemmy",
    )
    flow: list = []

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
    flow.append(Paragraph(title, styles["title"]))
    flow.append(Spacer(1, 2 * mm))
    flow.append(Paragraph(subtitle, styles["subtitle"]))
    flow.append(Spacer(1, 4 * mm))

    def _footer(canvas, doc_):
        canvas.saveState()
        canvas.setStrokeColor(BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, 14 * mm, PAGE_W - MARGIN, 14 * mm)
        canvas.setFont(FONT, 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(MARGIN, 10 * mm, f"{tenant.name or 'OneGemmy'} · {footer_label}")
        canvas.drawRightString(PAGE_W - MARGIN, 10 * mm, f"Page {doc_.page}")
        canvas.restoreState()

    return doc, flow, buf, _footer


def _finish_pdf(doc: SimpleDocTemplate, flow: list, buf: io.BytesIO, footer) -> bytes:
    doc.build(flow, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()


def _kpi_table(cells: list[tuple[str, str]], styles: dict, cols: int) -> Table:
    labels = [c[0] for c in cells]
    values = [c[1] for c in cells]
    table = Table([labels, values], colWidths=[CONTENT_W / cols] * cols, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 1), (-1, 1), CARD_BG),
        ("BOX", (0, 0), (-1, -1), 0.75, BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.75, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
    ]))
    for i, (label, value) in enumerate(cells):
        table._cellvalues[0][i] = Paragraph(label, styles["kpi_label"])
        table._cellvalues[1][i] = Paragraph(value, styles["kpi_value"])
    return table


def _data_table(header: list[str], rows: list[list], widths: list[float], styles: dict, repeat_header: bool = True) -> Table:
    styled_rows = [header] + rows
    table = Table(styled_rows, colWidths=widths, hAlign="LEFT", repeatRows=1 if repeat_header else 0)
    style_cmds = [
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


def _statement_lines_table(lines: list[StatementLine], styles: dict, width_money: float = 0.18) -> Table:
    rows = [
        [Paragraph(esc(l.code), styles["cell_muted"]),
         Paragraph(esc(l.name), styles["cell"]),
         Paragraph(_fmt_money(l.amount), styles["cell_right"])]
        for l in lines
    ]
    widths = [CONTENT_W * 0.12, CONTENT_W * (1 - 0.12 - width_money), CONTENT_W * width_money]
    return _data_table(["Code", "Account", "Amount"], rows, widths, styles, repeat_header=False)


# ── CSV ─────────────────────────────────────────────────────────────────────

def _csv_header(w: csv.writer, tenant: Tenant, title: str, period: str) -> None:
    if tenant.name:
        w.writerow([tenant.name])
    for line in _tenant_contact_lines(tenant):
        w.writerow([line])
    w.writerow([])
    w.writerow([title])
    w.writerow([period])
    w.writerow([f"Generated: {datetime.now(UTC).strftime('%Y-%m-%d %H:%M')} UTC"])
    w.writerow([])


def _csv_section_table(w: csv.writer, heading: str, lines: list[StatementLine], total: float) -> None:
    w.writerow([heading.upper()])
    w.writerow(["Code", "Account", "Amount"])
    for l in lines:
        w.writerow([l.code, l.name, _fmt_money(l.amount)])
    w.writerow([heading, "Total", _fmt_money(total)])
    w.writerow([])


def _income_csv(report: IncomeStatement, tenant: Tenant) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    _csv_header(w, tenant, "Income Statement", f"Period: {report.from_date} — {report.to_date}")
    _csv_section_table(w, "Revenue", report.revenue_accounts, report.total_revenue)
    _csv_section_table(w, "Cost of Goods Sold", report.cogs_accounts, report.total_cogs)
    w.writerow(["Gross Profit", "", _fmt_money(report.gross_profit)])
    w.writerow([])
    _csv_section_table(w, "Operating Expenses", report.operating_expense_accounts, report.total_operating_expenses)
    w.writerow(["Operating Income", "", _fmt_money(report.operating_income)])
    w.writerow([])
    _csv_section_table(w, "Other Income", report.other_income, report.total_other_income)
    w.writerow(["Net Income", "", _fmt_money(report.net_income)])
    w.writerow(["Net Margin", "", _fmt_pct(report.net_margin_pct)])
    return buf.getvalue().encode("utf-8-sig")


def _balance_csv(report: BalanceSheet, tenant: Tenant) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    _csv_header(w, tenant, "Balance Sheet", f"As of: {report.as_of}")

    def section(heading, section, total):
        w.writerow([heading.upper()])
        w.writerow(["Code", "Account", "Amount"])
        for l in section.accounts:
            w.writerow([l.code, l.name, _fmt_money(l.amount)])
        w.writerow([heading, "Total", _fmt_money(total)])
        w.writerow([])

    section("Current Assets", report.current_assets, report.current_assets.total)
    section("Non-Current Assets", report.non_current_assets, report.non_current_assets.total)
    w.writerow(["Total Assets", "", _fmt_money(report.total_assets)])
    w.writerow([])
    section("Current Liabilities", report.current_liabilities, report.current_liabilities.total)
    section("Non-Current Liabilities", report.non_current_liabilities, report.non_current_liabilities.total)
    w.writerow(["Total Liabilities", "", _fmt_money(report.total_liabilities)])
    w.writerow([])
    _csv_section_table(w, "Equity", report.equity_accounts, report.total_equity)
    w.writerow(["Retained Earnings", "", _fmt_money(report.retained_earnings)])
    w.writerow([])
    w.writerow(["Total Liabilities and Equity", "", _fmt_money(report.total_liabilities_and_equity)])
    w.writerow(["In Balance", "Yes" if report.in_balance else f"No ({_fmt_money(report.difference)})", ""])
    return buf.getvalue().encode("utf-8-sig")


def _cashflow_csv(report: CashFlowStatement, tenant: Tenant) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    _csv_header(w, tenant, "Cash Flow Statement", f"Period: {report.from_date} — {report.to_date}")

    def section(heading, section):
        w.writerow([heading.upper()])
        w.writerow(["Account", "Amount"])
        for l in section.lines:
            w.writerow([l.account_name, _fmt_money(l.amount)])
        w.writerow([heading, "Total", _fmt_money(section.total)])
        w.writerow([])

    section("Operating Activities", report.operating)
    section("Investing Activities", report.investing)
    section("Financing Activities", report.financing)
    w.writerow(["Net Change in Cash", "", _fmt_money(report.net_cash_change)])
    w.writerow(["Beginning Cash", "", _fmt_money(report.beginning_cash)])
    w.writerow(["Ending Cash", "", _fmt_money(report.ending_cash)])
    return buf.getvalue().encode("utf-8-sig")


def _trial_csv(report: TrialBalance, tenant: Tenant) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    _csv_header(w, tenant, "Trial Balance", f"Period: {report.from_date} — {report.to_date}")
    w.writerow(["Code", "Account", "Type", "Debits", "Credits", "Balance"])
    for a in report.accounts:
        w.writerow([a.code, a.name, a.type, _fmt_money(a.debit_total), _fmt_money(a.credit_total), _fmt_money(a.balance)])
    w.writerow(["TOTALS", "", "", _fmt_money(report.total_debits), _fmt_money(report.total_credits), _fmt_money(report.total_debits - report.total_credits)])
    w.writerow([])
    w.writerow(["Balanced", "Yes" if report.balanced else "No", "", "", "", ""])
    return buf.getvalue().encode("utf-8-sig")


def _ledger_csv(report: GeneralLedger, tenant: Tenant) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    _csv_header(w, tenant, "General Ledger", f"Period: {report.from_date} — {report.to_date}")
    w.writerow(["Ref", "Date", "Description", "Type", "Debit", "Credit"])
    for e in report.entries:
        w.writerow([e.reference, e.date, e.description or "", e.type, _fmt_money(e.debit) if e.debit else "", _fmt_money(e.credit) if e.credit else ""])
    w.writerow(["TOTALS", "", "", "", _fmt_money(report.total_debits), _fmt_money(report.total_credits)])
    return buf.getvalue().encode("utf-8-sig")


# ── PDF ─────────────────────────────────────────────────────────────────────

def _income_pdf(report: IncomeStatement, tenant: Tenant, styles: dict) -> bytes:
    doc, flow, buf, footer = _start_pdf(
        tenant, styles, "Income Statement",
        f"Period: {report.from_date} — {report.to_date}", "Income Statement",
    )
    flow.append(_kpi_table([
        ("Revenue", _fmt_money(report.total_revenue)),
        ("Cost of Goods", _fmt_money(report.total_cogs)),
        ("Gross Profit", _fmt_money(report.gross_profit)),
        ("Operating Expenses", _fmt_money(report.total_operating_expenses)),
        ("Net Income", _fmt_money(report.net_income)),
        ("Net Margin", _fmt_pct(report.net_margin_pct)),
    ], styles, cols=6))
    flow.append(Spacer(1, 4 * mm))

    flow.append(Paragraph("Revenue", styles["h2"]))
    flow.append(_statement_lines_table(report.revenue_accounts, styles))
    flow.append(Paragraph("Cost of Goods Sold", styles["h2"]))
    flow.append(_statement_lines_table(report.cogs_accounts, styles))
    flow.append(Paragraph("Operating Expenses", styles["h2"]))
    flow.append(_statement_lines_table(report.operating_expense_accounts, styles))
    flow.append(Paragraph("Other Income", styles["h2"]))
    flow.append(_statement_lines_table(report.other_income, styles))
    return _finish_pdf(doc, flow, buf, footer)


def _balance_pdf(report: BalanceSheet, tenant: Tenant, styles: dict) -> bytes:
    doc, flow, buf, footer = _start_pdf(
        tenant, styles, "Balance Sheet", f"As of: {report.as_of}", "Balance Sheet",
    )
    flow.append(_kpi_table([
        ("Total Assets", _fmt_money(report.total_assets)),
        ("Total Liabilities", _fmt_money(report.total_liabilities)),
        ("Total Equity", _fmt_money(report.total_equity)),
        ("Retained Earnings", _fmt_money(report.retained_earnings)),
        ("In Balance", "Yes" if report.in_balance else "No"),
    ], styles, cols=5))
    flow.append(Spacer(1, 4 * mm))

    for heading, section, total in [
        ("Current Assets", report.current_assets, report.current_assets.total),
        ("Non-Current Assets", report.non_current_assets, report.non_current_assets.total),
        ("Current Liabilities", report.current_liabilities, report.current_liabilities.total),
        ("Non-Current Liabilities", report.non_current_liabilities, report.non_current_liabilities.total),
    ]:
        flow.append(Paragraph(heading, styles["h2"]))
        flow.append(_statement_lines_table(section.accounts, styles))
        flow.append(Paragraph(f"Total {heading}: {_fmt_money(total)}", ParagraphStyle(
            "tot", fontName=FONT_BOLD, fontSize=8.5, leading=11, textColor=FOREGROUND, spaceAfter=4,
        )))

    flow.append(Paragraph("Equity", styles["h2"]))
    flow.append(_statement_lines_table(report.equity_accounts, styles))
    flow.append(Paragraph(f"Retained Earnings: {_fmt_money(report.retained_earnings)}", ParagraphStyle(
        "tot", fontName=FONT_BOLD, fontSize=8.5, leading=11, textColor=FOREGROUND, spaceAfter=4,
    )))
    flow.append(Paragraph(f"Total Liabilities and Equity: {_fmt_money(report.total_liabilities_and_equity)}", ParagraphStyle(
        "grand", fontName=FONT_BOLD, fontSize=10, leading=14, textColor=FOREGROUND, spaceBefore=2,
    )))
    return _finish_pdf(doc, flow, buf, footer)


def _cashflow_pdf(report: CashFlowStatement, tenant: Tenant, styles: dict) -> bytes:
    doc, flow, buf, footer = _start_pdf(
        tenant, styles, "Cash Flow Statement",
        f"Period: {report.from_date} — {report.to_date}", "Cash Flow Statement",
    )
    flow.append(_kpi_table([
        ("Net Change", _fmt_money(report.net_cash_change)),
        ("Beginning Cash", _fmt_money(report.beginning_cash)),
        ("Ending Cash", _fmt_money(report.ending_cash)),
    ], styles, cols=3))
    flow.append(Spacer(1, 4 * mm))

    for section in (report.operating, report.investing, report.financing):
        flow.append(Paragraph(section.title, styles["h2"]))
        rows = [
            [Paragraph(esc(l.account_name), styles["cell"]),
             Paragraph(_fmt_money(l.amount), styles["cell_right"])]
            for l in section.lines
        ]
        rows.append([
            Paragraph("Total", styles["tot_left"]),
            Paragraph(_fmt_money(section.total), styles["cell_right_bold"]),
        ])
        widths = [CONTENT_W * 0.82, CONTENT_W * 0.18]
        table = _data_table(["Account", "Amount"], rows, widths, styles, repeat_header=False)
        table.setStyle(TableStyle([("BACKGROUND", (0, -1), (-1, -1), CARD_BG)]))
        flow.append(table)
    return _finish_pdf(doc, flow, buf, footer)


def _trial_pdf(report: TrialBalance, tenant: Tenant, styles: dict) -> bytes:
    doc, flow, buf, footer = _start_pdf(
        tenant, styles, "Trial Balance",
        f"Period: {report.from_date} — {report.to_date}",
        "Trial Balance",
    )
    rows = [
        [Paragraph(esc(a.code), styles["cell_muted"]),
         Paragraph(esc(a.name), styles["cell"]),
         Paragraph(esc(a.type), styles["cell_muted"]),
         Paragraph(_fmt_money(a.debit_total), styles["cell_right"]),
         Paragraph(_fmt_money(a.credit_total), styles["cell_right"]),
         Paragraph(_fmt_money(a.balance), styles["cell_right_bold"])]
        for a in report.accounts
    ]
    rows.append([
        Paragraph("Totals", styles["tot_left"]), Paragraph("", styles["cell"]), Paragraph("", styles["cell"]),
        Paragraph(_fmt_money(report.total_debits), styles["cell_right_bold"]),
        Paragraph(_fmt_money(report.total_credits), styles["cell_right_bold"]),
        Paragraph(_fmt_money(report.total_debits - report.total_credits), styles["cell_right_bold"]),
    ])
    widths = [CONTENT_W * 0.10, CONTENT_W * 0.30, CONTENT_W * 0.15, CONTENT_W * 0.15, CONTENT_W * 0.15, CONTENT_W * 0.15]
    table = _data_table(["Code", "Account", "Type", "Debits", "Credits", "Balance"], rows, widths, styles)
    table.setStyle(TableStyle([("BACKGROUND", (0, -1), (-1, -1), CARD_BG)]))
    flow.append(table)
    flow.append(Spacer(1, 3 * mm))
    flow.append(Paragraph(f"Balanced: {'Yes' if report.balanced else 'No'}", styles["subtitle"]))
    return _finish_pdf(doc, flow, buf, footer)


def _ledger_pdf(report: GeneralLedger, tenant: Tenant, styles: dict) -> bytes:
    doc, flow, buf, footer = _start_pdf(
        tenant, styles, "General Ledger",
        f"Period: {report.from_date} — {report.to_date}", "General Ledger",
    )
    rows = [
        [Paragraph(esc(e.reference), styles["cell_muted"]),
         Paragraph(str(e.date), styles["cell_muted"]),
         Paragraph(esc(e.description or "—"), styles["cell"]),
         Paragraph(esc(e.type.capitalize()), styles["cell_muted"]),
         Paragraph(_fmt_money(e.debit) if e.debit else "", styles["cell_right"]),
         Paragraph(_fmt_money(e.credit) if e.credit else "", styles["cell_right"])]
        for e in report.entries
    ]
    rows.append([
        Paragraph("Totals", styles["tot_left"]), Paragraph("", styles["cell"]), Paragraph("", styles["cell"]), Paragraph("", styles["cell"]),
        Paragraph(_fmt_money(report.total_debits), styles["cell_right_bold"]),
        Paragraph(_fmt_money(report.total_credits), styles["cell_right_bold"]),
    ])
    widths = [CONTENT_W * 0.12, CONTENT_W * 0.10, CONTENT_W * 0.34, CONTENT_W * 0.10, CONTENT_W * 0.17, CONTENT_W * 0.17]
    table = _data_table(["Ref", "Date", "Description", "Type", "Debit", "Credit"], rows, widths, styles)
    table.setStyle(TableStyle([("BACKGROUND", (0, -1), (-1, -1), CARD_BG)]))
    flow.append(table)
    return _finish_pdf(doc, flow, buf, footer)


# ── Dispatcher ──────────────────────────────────────────────────────────────

BUILDERS = {
    "income-statement": (lambda r, t, s: (_income_csv(r, t), _income_pdf(r, t, s))),
    "balance-sheet": (lambda r, t, s: (_balance_csv(r, t), _balance_pdf(r, t, s))),
    "cash-flow": (lambda r, t, s: (_cashflow_csv(r, t), _cashflow_pdf(r, t, s))),
    "trial-balance": (lambda r, t, s: (_trial_csv(r, t), _trial_pdf(r, t, s))),
    "general-ledger": (lambda r, t, s: (_ledger_csv(r, t), _ledger_pdf(r, t, s))),
}


async def export_accounting_statement(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    statement: str,
    fmt: str,
    from_date: date | None = None,
    to_date: date | None = None,
    as_of: date | None = None,
    account_id: uuid.UUID | None = None,
) -> tuple[str, bytes, str]:
    builder = BUILDERS.get(statement)
    if builder is None:
        raise ValueError(f"Unknown statement: {statement}")

    tenant = await _load_tenant(db, tenant_id)

    if statement == "balance-sheet":
        report = await accounting_service.balance_sheet(db, tenant_id, as_of or datetime.now(UTC).date())
    elif statement == "general-ledger":
        report = await accounting_service.general_ledger(db, tenant_id, from_date, to_date, account_id)
    elif statement == "trial-balance":
        report = await accounting_service.trial_balance(db, tenant_id, from_date, to_date)
    elif statement == "income-statement":
        report = await accounting_service.income_statement(db, tenant_id, from_date, to_date)
    else:  # cash-flow
        report = await accounting_service.cash_flow(db, tenant_id, from_date, to_date)

    day = datetime.now(UTC).strftime("%Y-%m-%d")
    base_name = f"{statement}-{day}"

    if fmt == "csv":
        csv_bytes, _ = builder(report, tenant, _styles())
        return f"{base_name}.csv", csv_bytes, "text/csv; charset=utf-8"

    _register_fonts()
    _, pdf_bytes = builder(report, tenant, _styles())
    return f"{base_name}.pdf", pdf_bytes, "application/pdf"
