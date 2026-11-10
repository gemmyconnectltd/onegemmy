"""Purpose-built PDF layouts for the accounting reports. They share one design language (the business's identity header,
type scale, number format, "Page X of Y" footer) but each report has its own structure:

- Balance Sheet: statement of financial position, sections with indented accounts, totals and the balance check
- Profit & Loss: income statement with gross, operating and net profit lines
- Cash Flow: operating / investing / financing with the opening-to-closing cash reconciliation
- Changes in Equity: the equity bridge
- Trial Balance: compact debit/credit columns grouped by account type, totals and difference
- General Ledger: account register with opening balance, running balance and closing balance per account
- Receivables / Payables Aging: bucket summary, then invoices grouped by customer or supplier
- Inventory: valuation summary, then item lines with a stock status

Every figure comes from the report snapshot, which the validated statement services produced. Nothing is recalculated
here except presentation subtotals of the rows shown (column sums, running balances) and lines derived from stored
totals (operating profit = gross profit - operating expenses).
"""
from __future__ import annotations

from collections import OrderedDict
from decimal import Decimal
from functools import partial
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.currency import CURRENCIES
from app.modules.accounting.service.workspace_export import _date, _NumberedCanvas

INK, MUTED, RULE, SOFT = colors.HexColor("#111827"), colors.HexColor("#64748b"), colors.HexColor("#e5e7eb"), colors.HexColor("#f8fafc")
LAYOUTS = {"balance-sheet", "income-statement", "cash-flow", "equity", "trial-balance", "general-ledger", "receivables-aging", "payables-aging", "inventory"}


def D(value) -> Decimal:
    try:
        return Decimal(str(value if value not in (None, "") else 0))
    except Exception:  # noqa: BLE001 - non-numeric cells are treated as zero only for presentation sums
        return Decimal(0)


class _Kit:
    """Shared design primitives for one document."""

    def __init__(self, report: dict, tenant, portrait: bool):
        from app.core.brand_pdf import brand_color
        self.report, self.tenant = report, tenant
        self.currency = report.get("currency") or "RWF"
        self.places = CURRENCIES[self.currency].decimal_places if self.currency in CURRENCIES else 2
        self.accent = brand_color(tenant) if tenant is not None else colors.HexColor("#16a34a")
        self.pagesize = A4 if portrait else landscape(A4)
        self.width = self.pagesize[0] - 32 * mm
        base = ParagraphStyle("base", fontName="Helvetica", fontSize=8.5, leading=11.5, textColor=INK)
        self.s = {
            "body": base, "muted": ParagraphStyle("muted", parent=base, fontSize=7.5, leading=10, textColor=MUTED),
            "bold": ParagraphStyle("bold", parent=base, fontName="Helvetica-Bold"),
            "num": ParagraphStyle("num", parent=base, alignment=2), "numbold": ParagraphStyle("numbold", parent=base, fontName="Helvetica-Bold", alignment=2),
            "section": ParagraphStyle("section", parent=base, fontName="Helvetica-Bold", fontSize=9.5, leading=13, textColor=self.accent, spaceBefore=6),
            "subsection": ParagraphStyle("subsection", parent=base, fontName="Helvetica-Bold", fontSize=8.5, textColor=INK),
            "indent": ParagraphStyle("indent", parent=base, leftIndent=12),
            "title": ParagraphStyle("title", parent=base, fontName="Helvetica-Bold", fontSize=15, leading=18, alignment=2, textColor=self.accent),
            "meta": ParagraphStyle("meta", parent=base, fontSize=8, leading=10.5, alignment=2, textColor=colors.HexColor("#334155")),
            "biz": ParagraphStyle("biz", parent=base, fontName="Helvetica-Bold", fontSize=12, leading=15),
            "contact": ParagraphStyle("contact", parent=base, fontSize=7.5, leading=9.5, textColor=colors.HexColor("#475569")),
            "kpilabel": ParagraphStyle("kpil", parent=base, fontSize=7, leading=9, textColor=MUTED),
            "kpivalue": ParagraphStyle("kpiv", parent=base, fontName="Helvetica-Bold", fontSize=11, leading=14),
        }

    def p(self, text, style="body"):
        return Paragraph(escape(str(text if text is not None else "")), self.s[style])

    def money(self, value, blank_zero=False) -> str:
        amount = D(value)
        if blank_zero and amount == 0:
            return ""
        q = Decimal(1).scaleb(-self.places)
        text = f"{abs(amount.quantize(q)):,.{self.places}f}"
        return f"({text})" if amount < 0 else text  # accounting convention: negatives in brackets, never hidden

    def period(self) -> str:
        r = self.report
        if r.get("kind") in {"balance-sheet", "trial-balance", "receivables-aging", "payables-aging", "inventory"}:
            return f"As of {_date(r.get('as_of') or r.get('to_date'))}"
        return f"{_date(r.get('from_date'))} to {_date(r.get('to_date'))}"

    def header(self, title: str, subtitle: str | None = None) -> list:
        from app.core.brand_pdf import business_contact_lines, logo_flowable
        left = []
        if self.tenant is not None:
            left.append(logo_flowable(self.tenant, 40, 16))
            left.append(Spacer(1, 2 * mm))
        left.append(self.p(self.report["business"], "biz"))
        left += [self.p(line, "contact") for line in (business_contact_lines(self.tenant) if self.tenant is not None else [])]
        right = [self.p(title.upper(), "title")]
        if subtitle:
            right.append(self.p(subtitle, "meta"))
        right += [self.p(self.period(), "meta"), self.p(f"Branch: {self.report.get('branch') or 'All branches'}", "meta"),
                  self.p(f"Amounts in {self.currency}", "meta"), self.p(f"Generated {_date(self.report.get('generated_at'))}", "meta")]
        block = Table([[left, right]], colWidths=[self.width * 0.5, self.width * 0.5])
        block.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                                   ("LINEBELOW", (0, 0), (-1, 0), 1.6, self.accent), ("BOTTOMPADDING", (0, 0), (-1, 0), 8)]))
        return [block, Spacer(1, 6 * mm)]

    def kpis(self, items: list[tuple[str, str]]) -> Table:
        cells = [[self.p(label, "kpilabel"), self.p(value, "kpivalue")] for label, value in items]
        n = len(cells)
        table = Table([[c for c in cells]], colWidths=[self.width / n] * n)
        table.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, RULE), ("INNERGRID", (0, 0), (-1, -1), 0.6, RULE),
                                   ("BACKGROUND", (0, 0), (-1, -1), SOFT), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                                   ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
        return table

    def check(self, label: str, balanced: bool, difference) -> Table:
        text = f"{label}: {'balanced' if balanced else 'NOT BALANCED'} (difference {self.money(difference)} {self.currency})"
        table = Table([[self.p(text, "bold")]], colWidths=[self.width])
        tone = colors.HexColor("#ecfdf5") if balanced else colors.HexColor("#fef2f2")
        edge = colors.HexColor("#10b981") if balanced else colors.HexColor("#dc2626")
        table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), tone), ("LINEBEFORE", (0, 0), (0, -1), 3, edge),
                                   ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
        return table

    def notes(self) -> list:
        notes = [n for n in self.report.get("notes", []) if n]
        return [Spacer(1, 4 * mm)] + [self.p(n, "muted") for n in notes] if notes else []

    def footer(self, canvas, number: int, total: int) -> None:
        canvas.saveState()
        w, _ = self.pagesize
        canvas.setStrokeColor(RULE)
        canvas.line(16 * mm, 12 * mm, w - 16 * mm, 12 * mm)
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(MUTED)
        canvas.drawString(16 * mm, 8 * mm, f'{self.report["business"]} - {self.report["title"]}'[:120])
        canvas.drawRightString(w - 16 * mm, 8 * mm, f"Page {number} of {total}")
        canvas.restoreState()


def _statement_table(kit: _Kit, lines: list[tuple[str, str, object, str]]) -> Table:
    """Rows of (label, code, amount, kind) where kind is section | sub | line | subtotal | total | keytotal | gap."""
    data, style = [], [("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                       ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]
    for i, (label, code, amount, kind) in enumerate(lines):
        if kind == "gap":
            data.append(["", "", ""])
            continue
        if kind == "section":
            data.append([kit.p(label, "section"), "", ""])
            continue
        if kind == "sub":
            data.append([kit.p(label, "subsection"), "", ""])
            continue
        bold = kind in {"subtotal", "total", "keytotal"}
        data.append([kit.p(label, "bold" if bold else "indent"), kit.p(code or "", "muted"), kit.p(kit.money(amount), "numbold" if bold else "num")])
        if kind == "subtotal":
            style.append(("LINEABOVE", (2, i), (2, i), 0.6, INK))
        elif kind == "total":
            style += [("LINEABOVE", (0, i), (-1, i), 0.8, INK), ("BACKGROUND", (0, i), (-1, i), SOFT)]
        elif kind == "keytotal":
            style += [("LINEABOVE", (0, i), (-1, i), 1, INK), ("LINEBELOW", (0, i), (-1, i), 1.6, INK), ("BACKGROUND", (0, i), (-1, i), SOFT)]
    table = Table(data, colWidths=[kit.width * 0.62, kit.width * 0.13, kit.width * 0.25], repeatRows=0)
    table.setStyle(TableStyle(style))
    return table


def _sections(rows: list[dict]) -> OrderedDict:
    grouped: OrderedDict[str, list[dict]] = OrderedDict()
    for row in rows:
        grouped.setdefault(row.get("section") or "", []).append(row)
    return grouped


def _account_lines(rows, kind="line"):
    return [(r.get("name"), r.get("code") if r.get("code") not in (None, "—") else "", r.get("amount"), kind) for r in rows]


def balance_sheet(kit: _Kit, rows: list[dict]) -> list:
    s, t = _sections(rows), kit.report.get("totals", {})
    lines = [("ASSETS", "", None, "section")]
    for name in ("Current assets", "Non-current assets"):
        lines += [(name, "", None, "sub"), *_account_lines(s.get(name, [])), (f"Total {name.lower()}", "", sum((D(r["amount"]) for r in s.get(name, [])), Decimal(0)), "subtotal")]
    lines += [("TOTAL ASSETS", "", t.get("Assets"), "total"), ("", "", None, "gap"), ("LIABILITIES", "", None, "section")]
    for name in ("Current liabilities", "Non-current liabilities"):
        lines += [(name, "", None, "sub"), *_account_lines(s.get(name, [])), (f"Total {name.lower()}", "", sum((D(r["amount"]) for r in s.get(name, [])), Decimal(0)), "subtotal")]
    lines += [("TOTAL LIABILITIES", "", t.get("Liabilities"), "total"), ("", "", None, "gap"), ("EQUITY", "", None, "section"),
              *_account_lines(s.get("Equity", [])), ("TOTAL EQUITY", "", t.get("Equity"), "total"), ("", "", None, "gap"),
              ("TOTAL LIABILITIES AND EQUITY", "", t.get("Liabilities + equity"), "keytotal")]
    rec = kit.report.get("reconciliation") or {}
    story = kit.header("Balance Sheet", "Statement of financial position") + [_statement_table(kit, lines), Spacer(1, 5 * mm)]
    if rec:
        story.append(kit.check("Total assets - (total liabilities + equity) = 0", bool(rec.get("balanced")), rec.get("difference", 0)))
    negatives = [r for r in rows if r.get("section") in ("Current assets", "Non-current assets") and D(r.get("amount")) < 0]
    if negatives:
        story += [Spacer(1, 3 * mm), kit.p("Review: " + "; ".join(f"{r.get('name')} shows a negative balance ({kit.money(r.get('amount'))})" for r in negatives)
                                          + ". It is reported as recorded, not hidden or reversed.", "muted")]
    return story + kit.notes()


def income_statement(kit: _Kit, rows: list[dict]) -> list:
    s, t = _sections(rows), kit.report.get("totals", {})
    gross, opex = D(t.get("Gross profit")), D(t.get("Operating expenses"))
    operating = gross - opex
    revenue = D(t.get("Revenue"))
    lines = [("REVENUE", "", None, "section"), *_account_lines(s.get("Revenue", [])), ("Net revenue", "", revenue, "subtotal"),
             ("COST OF GOODS SOLD", "", None, "section"), *_account_lines(s.get("Cost of goods sold", [])), ("Total cost of goods sold", "", t.get("Cost of goods sold"), "subtotal"),
             ("GROSS PROFIT", "", gross, "total"), ("OPERATING EXPENSES", "", None, "section"), *_account_lines(s.get("Operating expenses", [])),
             ("Total operating expenses", "", opex, "subtotal"), ("OPERATING PROFIT", "", operating, "total")]
    if s.get("Other income") or s.get("Other expenses") or D(t.get("Other income")) or D(t.get("Other expenses")):
        lines += [("OTHER INCOME AND EXPENSES", "", None, "section"), *_account_lines(s.get("Other income", [])),
                  *[(n, c, -D(a), k) for n, c, a, k in _account_lines(s.get("Other expenses", []))],
                  ("Net other income / (expenses)", "", D(t.get("Other income")) - D(t.get("Other expenses")), "subtotal")]
    lines += [("", "", None, "gap"), ("NET PROFIT / (LOSS)", "", t.get("Net profit"), "keytotal")]
    story = kit.header("Profit & Loss Statement", "Income statement")
    if revenue:
        story += [kit.kpis([("Net revenue", kit.money(revenue)), ("Gross margin", f"{gross / revenue * 100:.1f}%"),
                            ("Operating margin", f"{operating / revenue * 100:.1f}%"), ("Net margin", f"{D(t.get('Net profit')) / revenue * 100:.1f}%")]),
                  Spacer(1, 5 * mm)]
    return story + [_statement_table(kit, lines)] + kit.notes()


def cash_flow(kit: _Kit, rows: list[dict]) -> list:
    s, t = _sections(rows), kit.report.get("totals", {})
    lines = []
    for title, key in (("Operating activities", "Operating"), ("Investing activities", "Investing"), ("Financing activities", "Financing")):
        group = next((rows_ for name, rows_ in s.items() if name.lower().startswith(key.lower())), [])
        lines += [(title.upper(), "", None, "section"), *_account_lines(group), (f"Net cash from {title.lower()}", "", t.get(key), "subtotal")]
    lines += [("", "", None, "gap"), ("NET CHANGE IN CASH", "", t.get("Net change"), "total"), ("Opening cash balance", "", t.get("Opening cash"), "line"),
              ("CLOSING CASH BALANCE", "", t.get("Closing cash"), "keytotal")]
    rec = kit.report.get("reconciliation") or {}
    story = kit.header("Cash Flow Statement") + [_statement_table(kit, lines), Spacer(1, 5 * mm)]
    if rec:
        story.append(kit.check("Opening cash + net change = closing cash", bool(rec.get("balanced")), rec.get("difference", 0)))
    return story + kit.notes()


def equity(kit: _Kit, rows: list[dict]) -> list:
    lines = [("EQUITY BRIDGE", "", None, "section")]
    for r in rows:
        name = r.get("name") or ""
        lines.append((name, "", r.get("amount"), "keytotal" if name.lower().startswith("closing") else "line"))
    rec = kit.report.get("reconciliation") or {}
    story = kit.header("Statement of Changes in Equity") + [_statement_table(kit, lines), Spacer(1, 5 * mm)]
    if rec:
        story.append(kit.check("Opening equity + profit + movements = closing equity", bool(rec.get("balanced")), rec.get("difference", 0)))
    return story + kit.notes()


DEBIT_NORMAL = {"Assets", "Expense", "Expenses"}


def trial_balance(kit: _Kit, rows: list[dict]) -> list:
    """Each account's closing balance in its debit or credit column, grouped by account type."""
    groups: OrderedDict[str, list[dict]] = OrderedDict()
    for row in sorted(rows, key=lambda r: str(r.get("code") or "")):
        groups.setdefault(row.get("type") or "Other", []).append(row)
    data = [[kit.p("Code", "bold"), kit.p("Account", "bold"), kit.p("Debit", "numbold"), kit.p("Credit", "numbold")]]
    style = [("LINEBELOW", (0, 0), (-1, 0), 0.8, INK), ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5)]
    debit_total = credit_total = Decimal(0)
    for kind, accounts in groups.items():
        style.append(("BACKGROUND", (0, len(data)), (-1, len(data)), SOFT))
        data.append([kit.p(kind, "section"), "", "", ""])
        for r in accounts:
            balance = D(r.get("amount"))
            debit_side = (kind in DEBIT_NORMAL) == (balance >= 0)
            value = abs(balance)
            debit_total += value if debit_side else 0
            credit_total += 0 if debit_side else value
            data.append([kit.p(r.get("code"), "muted"), kit.p(r.get("name"), "indent"),
                         kit.p(kit.money(value, True) if debit_side else "", "num"), kit.p("" if debit_side else kit.money(value, True), "num")])
    row = len(data)
    data.append(["", kit.p("TOTALS", "bold"), kit.p(kit.money(debit_total), "numbold"), kit.p(kit.money(credit_total), "numbold")])
    data.append(["", kit.p("Difference", "bold"), kit.p(kit.money(debit_total - credit_total), "numbold"), ""])
    style += [("LINEABOVE", (0, row), (-1, row), 1, INK), ("LINEBELOW", (0, row), (-1, row), 1.6, INK), ("BACKGROUND", (0, row), (-1, row + 1), SOFT)]
    table = Table(data, colWidths=[kit.width * 0.12, kit.width * 0.52, kit.width * 0.18, kit.width * 0.18], repeatRows=1)
    table.setStyle(TableStyle(style))
    rec = kit.report.get("reconciliation") or {}
    story = kit.header("Trial Balance") + [table, Spacer(1, 5 * mm)]
    story.append(kit.check("Total debits = total credits", debit_total == credit_total and bool(rec.get("balanced", True)), debit_total - credit_total))
    story.append(kit.p("Equal totals show the ledger is arithmetically balanced; they do not prove every entry is posted to the right account.", "muted"))
    return story + kit.notes()


def general_ledger(kit: _Kit, rows: list[dict]) -> list:
    """Account register: per account, opening balance, its lines in date order with a running balance, and the closing balance."""
    opening = kit.report.get("opening_balances") or {}
    accounts: OrderedDict[str, list[dict]] = OrderedDict()
    for row in sorted(rows, key=lambda r: (str(r.get("account") or ""), str(r.get("date") or ""), str(r.get("reference") or ""))):
        accounts.setdefault(row.get("account") or "Unassigned", []).append(row)
    widths = [kit.width * w for w in (0.09, 0.09, 0.15, 0.31, 0.12, 0.12, 0.12)]
    head = [kit.p(h, "bold") for h in ("Date", "Journal", "Source", "Description")] + [kit.p(h, "numbold") for h in ("Debit", "Credit", "Balance")]
    story = kit.header("General Ledger", "Account register")
    grand_debit = grand_credit = Decimal(0)
    for account, lines in accounts.items():
        balance = D(opening.get(account, 0))
        data = [[kit.p(account, "section"), "", "", "", "", "", ""], head,
                ["", "", "", kit.p("Opening balance", "bold"), "", "", kit.p(kit.money(balance), "numbold")]]
        debit_sum = credit_sum = Decimal(0)
        for r in lines:
            debit, credit = D(r.get("debit")), D(r.get("credit"))
            balance += debit - credit
            debit_sum += debit
            credit_sum += credit
            data.append([kit.p(_date(r.get("date")), "body"), kit.p(r.get("reference"), "body"), kit.p(r.get("transaction_reference"), "muted"),
                         kit.p(r.get("name"), "body"), kit.p(kit.money(debit, True), "num"), kit.p(kit.money(credit, True), "num"), kit.p(kit.money(balance), "num")])
        last = len(data)
        data.append(["", "", "", kit.p("Closing balance", "bold"), kit.p(kit.money(debit_sum), "numbold"), kit.p(kit.money(credit_sum), "numbold"), kit.p(kit.money(balance), "numbold")])
        grand_debit += debit_sum
        grand_credit += credit_sum
        table = Table(data, colWidths=widths, repeatRows=2)
        table.setStyle(TableStyle([("SPAN", (0, 0), (-1, 0)), ("LINEBELOW", (0, 1), (-1, 1), 0.6, INK), ("BACKGROUND", (0, 2), (-1, 2), SOFT),
                                   ("LINEABOVE", (0, last), (-1, last), 0.8, INK), ("BACKGROUND", (0, last), (-1, last), SOFT),
                                   ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
        story += [table, Spacer(1, 5 * mm)]
    if not accounts:
        story.append(kit.p("No posted journal lines in this period.", "muted"))
    rec = kit.report.get("reconciliation") or {}
    story.append(kit.kpis([("Total debits", kit.money(grand_debit)), ("Total credits", kit.money(grand_credit)), ("Accounts", str(len(accounts)))]))
    if rec and rec.get("applicable") is not False:
        story += [Spacer(1, 3 * mm), kit.check("Posted debits = posted credits", bool(rec.get("balanced")), rec.get("difference", 0))]
    return story + kit.notes()


BUCKETS = [("current", "Current"), ("days_1_30", "1-30 days"), ("days_31_60", "31-60 days"), ("days_61_90", "61-90 days"), ("over_90", "Over 90 days")]


def aging(kit: _Kit, rows: list[dict]) -> list:
    payable = kit.report.get("kind") == "payables-aging"
    party = "Supplier" if payable else "Customer"
    totals = kit.report.get("totals", {})
    summary_keys = ["Current", "1–30 days", "31–60 days", "61–90 days", "Over 90 days"]
    story = kit.header("Accounts Payable Aging" if payable else "Accounts Receivable Aging", "Supplier obligations by age" if payable else "Credit exposure by age")
    story += [kit.kpis([("Total outstanding", kit.money(totals.get("Total outstanding")))] + [(k, kit.money(totals.get(k))) for k in summary_keys]), Spacer(1, 5 * mm)]
    parties: OrderedDict[str, list[dict]] = OrderedDict()
    for row in sorted(rows, key=lambda r: (str(r.get("name") or ""), str(r.get("due_date") or ""))):
        parties.setdefault(row.get("name") or "Unknown", []).append(row)
    head = [kit.p(h, "bold") for h in ("Bill" if payable else "Invoice", "Due date", "Terms")] + [kit.p(label, "numbold") for _, label in BUCKETS] + [kit.p("Total", "numbold")]
    widths = [kit.width * w for w in (0.14, 0.1, 0.12, 0.1, 0.1, 0.1, 0.1, 0.1, 0.14)]
    data, style = [head], [("LINEBELOW", (0, 0), (-1, 0), 0.8, INK), ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]
    for name, invoices in parties.items():
        style.append(("BACKGROUND", (0, len(data)), (-1, len(data)), SOFT))
        data.append([kit.p(name, "subsection"), "", "", "", "", "", "", "", ""])
        sums = dict.fromkeys([b for b, _ in BUCKETS], Decimal(0))
        for r in invoices:
            bucket, amount = r.get("bucket"), D(r.get("amount"))
            if bucket in sums:
                sums[bucket] += amount
            data.append([kit.p(r.get("reference")), kit.p(_date(r.get("due_date")) if r.get("due_date") else "-"), kit.p(r.get("due_note") or "", "muted")]
                        + [kit.p(kit.money(amount, True) if bucket == b else "", "num") for b, _ in BUCKETS] + [kit.p(kit.money(amount), "num")])
        row = len(data)
        data.append([kit.p(f"{party} total", "bold"), "", ""] + [kit.p(kit.money(sums[b], True), "numbold") for b, _ in BUCKETS] + [kit.p(kit.money(sum(sums.values(), Decimal(0))), "numbold")])
        style.append(("LINEABOVE", (3, row), (-1, row), 0.6, INK))
        overdue = sum((v for k, v in sums.items() if k != "current"), Decimal(0))
        if overdue > 0:
            style.append(("TEXTCOLOR", (4, row), (7, row), colors.HexColor("#b91c1c")))
    if len(data) == 1:
        data.append([kit.p("Nothing outstanding.", "muted"), "", "", "", "", "", "", "", ""])
    table = Table(data, colWidths=widths, repeatRows=1)
    table.setStyle(TableStyle(style))
    story.append(table)
    rec = kit.report.get("reconciliation") or {}
    if rec:
        story += [Spacer(1, 4 * mm), kit.check(rec.get("label", "Subledger versus control account"), bool(rec.get("balanced")), rec.get("difference", 0))]
    return story + kit.notes()


def inventory(kit: _Kit, rows: list[dict]) -> list:
    total = D(kit.report.get("totals", {}).get("Inventory value"))
    zero = sum(1 for r in rows if D(r.get("quantity")) == 0)
    negative = [r for r in rows if D(r.get("quantity")) < 0]
    story = kit.header("Inventory Valuation", "Stock on hand at recorded unit cost")
    story += [kit.kpis([("Inventory value", kit.money(total)), ("Items", f"{len(rows):,}"), ("Units on hand", f"{D(kit.report.get('quantity')).normalize():,f}"),
                        ("Out of stock", f"{zero:,}"), ("Negative stock", f"{len(negative):,}")]), Spacer(1, 5 * mm)]
    data = [[kit.p("SKU", "bold"), kit.p("Product / variant", "bold"), kit.p("Status", "bold"), kit.p("Quantity", "numbold"), kit.p("Unit cost", "numbold"), kit.p("Stock value", "numbold")]]
    style = [("LINEBELOW", (0, 0), (-1, 0), 0.8, INK), ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]
    for r in sorted(rows, key=lambda r: -D(r.get("amount"))):
        qty = D(r.get("quantity"))
        status = "Negative - review" if qty < 0 else "Out of stock" if qty == 0 else "In stock"
        if qty < 0:
            style.append(("TEXTCOLOR", (2, len(data)), (3, len(data)), colors.HexColor("#b91c1c")))
        data.append([kit.p(r.get("code"), "muted"), kit.p(r.get("name")), kit.p(status, "muted"), kit.p(f"{qty.normalize():,f}", "num"),
                     kit.p(kit.money(r.get("unit_cost")), "num"), kit.p(kit.money(r.get("amount")), "num")])
    row = len(data)
    data.append(["", kit.p("TOTAL", "bold"), "", "", "", kit.p(kit.money(total), "numbold")])
    style += [("LINEABOVE", (0, row), (-1, row), 1, INK), ("BACKGROUND", (0, row), (-1, row), SOFT)]
    table = Table(data, colWidths=[kit.width * w for w in (0.14, 0.38, 0.14, 0.1, 0.12, 0.12)], repeatRows=1)
    table.setStyle(TableStyle(style))
    story.append(table)
    rec = kit.report.get("reconciliation") or {}
    if rec:
        story += [Spacer(1, 4 * mm), kit.check(rec.get("label", "Inventory versus control account"), bool(rec.get("balanced")), rec.get("difference", 0))]
    return story + kit.notes()


BUILDERS = {"balance-sheet": (balance_sheet, True), "income-statement": (income_statement, True), "cash-flow": (cash_flow, True), "equity": (equity, True),
            "trial-balance": (trial_balance, True), "general-ledger": (general_ledger, False), "receivables-aging": (aging, False),
            "payables-aging": (aging, False), "inventory": (inventory, True)}


def render(path: str, report: dict, rows: list[dict], tenant=None) -> None:
    builder, portrait = BUILDERS[report["kind"]]
    kit = _Kit(report, tenant, portrait)
    doc = SimpleDocTemplate(path, pagesize=kit.pagesize, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=18 * mm,
                            title=f'{report["title"]} - {report["business"]}', author=report["business"],
                            subject=f'Report reference {report.get("id", "")}; generated {report.get("generated_at", "")}')
    story = builder(kit, rows)
    doc.build([KeepTogether(story[:1]), *story[1:]], canvasmaker=partial(_NumberedCanvas, footer=kit.footer))
