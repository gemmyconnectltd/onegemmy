"""Stream snapshot rows to bounded export writers; never re-query live financial sources."""
import asyncio
import csv
import os
import re
import tempfile
import uuid
from decimal import Decimal
from xml.sax.saxutils import escape

from openpyxl import Workbook
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph

from app.core.currency import CURRENCIES, format_money
from app.modules.accounting.repository.reporting import ReportingRepository
from app.modules.accounting.service.workspace import read_snapshot


def safe_text(value: object) -> str:
    text = str(value or "")
    return "'" + text if text.lstrip().startswith(("=", "+", "-", "@")) else text


def _date(value) -> str:
    """ISO dates and timestamps as "10 Nov 2026" / "10 Nov 2026, 14:05"; anything else unchanged."""
    from datetime import date, datetime
    text = str(value or "")
    try:
        if len(text) == 10:
            return date.fromisoformat(text).strftime("%d %b %Y")
        parsed = datetime.fromisoformat(text)
        return parsed.strftime("%d %b %Y, %H:%M") + (" UTC" if parsed.utcoffset() is not None and not parsed.utcoffset() else "")
    except ValueError:
        return text


class _NumberedCanvas(Canvas):
    """Defers every page footer until the document is finished, so each page can say "Page X of Y"."""

    def __init__(self, *args, footer=None, **kwargs):
        super().__init__(*args, **kwargs)
        self._pages: list[dict] = []
        self._footer = footer

    def showPage(self):
        self._pages.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        if self._code:  # the page still being drawn (platypus has already closed its last page)
            self._pages.append(dict(self.__dict__))
        total = len(self._pages)
        for state in self._pages:
            self.__dict__.update(state)
            if self._footer:
                self._footer(self, self._pageNumber, total)
            Canvas.showPage(self)
        Canvas.save(self)


class ExportWriter:
    """One writer for every tabular export (financial snapshots, debt statements, purchase orders): PDF, Excel and CSV from
    the same rows. PDFs carry the business's own identity (logo, contacts, TIN/VAT number, brand colour), a metadata line,
    repeated column headers, journal grouping for the General Ledger and "Page X of Y". Internal ids stay in the file
    properties, not on the page. Excel keeps real numbers and dates with formats, widths, a frozen header and filters."""

    def __init__(self, path: str, fmt: str, report: dict, tenant=None):
        self.path, self.fmt, self.report, self.tenant = path, fmt, report, tenant
        self.columns = report["columns"]
        self.currency = report.get("currency") or "RWF"
        self.grouped = report.get("kind") == "general-ledger" and fmt == "pdf"
        self._group: dict | None = None
        meta = [("Report", report["title"]), ("Business", report["business"]), ("Branch", report.get("branch") or "All branches"),
                ("Currency", self.currency), ("Period", self._period()), ("Generated", _date(report.get("generated_at")))]
        self.meta = [(k, v) for k, v in meta if v]
        if fmt == "csv":
            with open(path, "w", encoding="utf-8-sig", newline="") as output:
                writer = csv.writer(output)
                for label, value in self.meta:
                    writer.writerow([label, safe_text(value)])
                writer.writerow([])
                writer.writerow([c["label"] for c in self.columns])
        elif fmt == "xlsx":
            from openpyxl.styles import Font
            self.book = Workbook()
            self.sheet = self.book.active
            self.sheet.title = (re.sub(r"[\\/*?:\[\]]", " ", str(report["title"]))[:31].strip() or "Report")
            bold = Font(bold=True)
            for label, value in self.meta:
                self.sheet.append([label, safe_text(value)])
                self.sheet.cell(row=self.sheet.max_row, column=1).font = bold
            self.sheet.append([])
            self.sheet.append([c["label"] for c in self.columns])
            self.header_row = self.sheet.max_row
            for cell in self.sheet[self.header_row]:
                cell.font = bold
            self.sheet.freeze_panes = f"A{self.header_row + 1}"
            places = CURRENCIES[self.currency].decimal_places if self.currency in CURRENCIES else 2
            self.money_format = "#,##0" + ("." + "0" * places if places else "")
            self.widths = [max(len(c["label"]), 10) for c in self.columns]
        else:
            from app.core.brand_pdf import brand_color
            self.accent = brand_color(tenant) if tenant is not None else colors.HexColor("#16a34a")
            # Grouped ledger: date, journal, source and status are in each journal's heading, so the lines don't repeat them.
            self.pcols = [c for c in self.columns if not (self.grouped and c["key"] in {"date", "reference", "transaction_reference", "status"})]
            self.pagesize = landscape(A4) if len(self.pcols) > 5 else A4
            self.width, self.height = self.pagesize
            self.margin = 36
            self.canvas = _NumberedCanvas(path, pagesize=self.pagesize, footer=self._footer)
            self.canvas.setTitle(f'{report["title"]} - {report["business"]}')
            self.canvas.setAuthor(report["business"])
            self.canvas.setSubject(f'Report reference {report.get("id", "")}; generated {report.get("generated_at", "")}')
            self.page = 0
            weights = [3.2 if c["key"] in {"name", "account", "description"} else 1.5 if c["kind"] in {"money", "number"}
                       else 1.2 if c["kind"] == "date" else 1.6 for c in self.pcols]
            scale = (self.width - self.margin * 2) / sum(weights)
            self.widths = [w * scale for w in weights]
            self.normal = ParagraphStyle("financial-cell", fontName="Helvetica", fontSize=8, leading=10.5, textColor=colors.HexColor("#1f2937"))
            self.bold = ParagraphStyle("financial-bold", parent=self.normal, fontName="Helvetica-Bold")
            self.muted = ParagraphStyle("financial-muted", parent=self.normal, fontSize=7.5, textColor=colors.HexColor("#64748b"))
            self._new_page()

    def _period(self) -> str:
        start, end, as_of = self.report.get("from_date"), self.report.get("to_date"), self.report.get("as_of")
        if start and end and start != end:
            return f"{_date(start)} to {_date(end)}"
        return f"As of {_date(as_of or end or start)}" if (as_of or end or start) else ""

    # ── PDF ──────────────────────────────────────────────────────────────────
    def _paragraph(self, value, bold=False, style=None):
        text = str("" if value is None else value).replace("–", "-").replace("—", "-")
        return Paragraph(escape(text), style or (self.bold if bold else self.normal))

    def _footer(self, canvas, number: int, total: int) -> None:
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#e5e7eb"))
        canvas.line(self.margin, 30, self.width - self.margin, 30)
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(colors.HexColor("#64748b"))
        canvas.drawString(self.margin, 19, f'{self.report["business"]} - {self.report["title"]} - generated {_date(self.report.get("generated_at"))}'[:140])
        canvas.drawRightString(self.width - self.margin, 19, f"Page {number} of {total}")
        canvas.restoreState()

    def _identity(self) -> float:
        """The business header on the first page: logo, name and contact lines on the left, report title and metadata on the right."""
        from app.core.brand_pdf import business_contact_lines, logo_flowable
        top = self.height - 32
        left_x = self.margin
        if self.tenant is not None:
            logo = logo_flowable(self.tenant, 40, 16)
            _w, h = logo.wrapOn(self.canvas, 40 * 2.835, 16 * 2.835)
            logo.drawOn(self.canvas, left_x, top - h)
            y = top - h - 12
        else:
            y = top - 4
        self.canvas.setFillColor(colors.HexColor("#111827"))
        self.canvas.setFont("Helvetica-Bold", 12)
        self.canvas.drawString(left_x, y, str(self.report["business"])[:80])
        y -= 11
        self.canvas.setFont("Helvetica", 7.5)
        self.canvas.setFillColor(colors.HexColor("#475569"))
        for line in (business_contact_lines(self.tenant) if self.tenant is not None else []):
            self.canvas.drawString(left_x, y, line[:110])
            y -= 9.5
        right = self.width - self.margin
        ty = top - 6
        self.canvas.setFillColor(self.accent)
        self.canvas.setFont("Helvetica-Bold", 15)
        self.canvas.drawRightString(right, ty, str(self.report["title"]).upper()[:70])
        ty -= 14
        self.canvas.setFont("Helvetica", 8)
        self.canvas.setFillColor(colors.HexColor("#334155"))
        for label, value in self.meta[2:]:
            self.canvas.drawRightString(right, ty, f"{label}: {value}"[:110])
            ty -= 10.5
        bottom = min(y, ty) - 6
        self.canvas.setFillColor(self.accent)
        self.canvas.rect(self.margin, bottom, self.width - self.margin * 2, 1.6, fill=1, stroke=0)
        return bottom - 12

    def _new_page(self):
        if self.page:
            self.canvas.showPage()
        self.page += 1
        if self.page == 1:
            self.y = self._identity()
        else:  # later pages: a compact running header
            self.y = self.height - 30
            self.canvas.setFont("Helvetica-Bold", 9)
            self.canvas.setFillColor(colors.HexColor("#111827"))
            self.canvas.drawString(self.margin, self.y, f'{self.report["business"]} - {self.report["title"]}'[:120])
            self.canvas.setFont("Helvetica", 7.5)
            self.canvas.setFillColor(colors.HexColor("#64748b"))
            self.canvas.drawRightString(self.width - self.margin, self.y, f"{self._period()} - {self.currency}")
            self.y -= 14
        self._pdf_row([c["label"] for c in self.pcols], header=True, check_page=False)

    def _pdf_row(self, values, bold=False, header=False, check_page=True, shade=None):
        paragraphs = []
        for value, column in zip(values, self.pcols, strict=True):
            style = ParagraphStyle("hdr", parent=self.bold, textColor=colors.white) if header else (self.bold if bold else self.normal)
            if column["kind"] in {"money", "number"}:
                style = ParagraphStyle("num", parent=style, alignment=2)
            paragraphs.append(self._paragraph(value, style=style))
        heights = [p.wrap(w - 10, 400)[1] for p, w in zip(paragraphs, self.widths, strict=True)]
        height = max(heights, default=10) + 9
        if check_page and self.y - height < 42:
            self._new_page()
        fill = self.accent if header else shade
        if fill is not None:
            self.canvas.setFillColor(fill)
            self.canvas.rect(self.margin, self.y - height, self.width - self.margin * 2, height, fill=1, stroke=0)
        x = self.margin
        for p, width, ph in zip(paragraphs, self.widths, heights, strict=True):
            p.drawOn(self.canvas, x + 5, self.y - 4.5 - ph)
            x += width
        self.y -= height
        if not header:
            self.canvas.setStrokeColor(colors.HexColor("#eef0f3"))
            self.canvas.line(self.margin, self.y, self.width - self.margin, self.y)

    def _cell(self, column, value):
        if column["kind"] in {"money", "number"}:
            if value in (None, ""):
                return ""
            amount = Decimal(str(value))
            if column["kind"] == "money":
                return "" if amount == 0 and self.grouped else format_money(amount, self.currency).split(" ", 1)[-1]
            return f"{amount.normalize():,f}"
        if column["kind"] == "date":
            return _date(value)
        return value

    def _close_group(self):
        if not self._group:
            return
        g, values = self._group, []
        for column in self.pcols:
            values.append(format_money(g[column["key"]], self.currency).split(" ", 1)[-1] if column["key"] in ("debit", "credit")
                          else "Journal total" if column["key"] == "name" else "")
        self._pdf_row(values, bold=True, shade=colors.HexColor("#f8fafc"))
        self.y -= 4
        self._group = None

    def _ledger_row(self, row):
        """General Ledger in the PDF: one heading per journal (number, date, source), its lines, then the journal total."""
        if self._group is None or self._group["id"] != row.get("transaction_id"):
            self._close_group()
            self._group = {"id": row.get("transaction_id"), "debit": Decimal(0), "credit": Decimal(0)}
            heading = [""]
            heading[0] = f'{row.get("reference", "")}  -  {_date(row.get("date"))}  -  {row.get("transaction_reference") or ""}'
            first = self._paragraph(heading[0], style=ParagraphStyle("jh", parent=self.bold, textColor=self.accent))
            needed = first.wrap(self.width - self.margin * 2, 100)[1] + 30
            if self.y - needed < 42:
                self._new_page()
            first.drawOn(self.canvas, self.margin + 5, self.y - 4 - first.wrap(self.width - self.margin * 2, 100)[1])
            self.y -= first.wrap(self.width - self.margin * 2, 100)[1] + 7
        for key in ("debit", "credit"):
            self._group[key] += Decimal(str(row.get(key) or 0))
        self._pdf_row([self._cell(c, row.get(c["key"])) for c in self.pcols])

    def rows(self, rows: list[dict]):
        for row in rows:
            if self.fmt == "pdf":
                if self.grouped:
                    self._ledger_row(row)
                else:
                    self._pdf_row([self._cell(c, row.get(c["key"])) for c in self.pcols])
                continue
            values = []
            for column in self.columns:
                value = row.get(column["key"])
                if column["kind"] in {"money", "number"}:
                    value = "" if value in (None, "") else Decimal(str(value))
                elif column["kind"] == "date" and self.fmt == "xlsx" and value:
                    from datetime import date
                    try:
                        value = date.fromisoformat(str(value)[:10])
                    except ValueError:
                        value = safe_text(value)
                else:
                    value = safe_text(value)
                values.append(value)
            if self.fmt == "csv":
                with open(self.path, "a", encoding="utf-8", newline="") as output:
                    csv.writer(output).writerow(values)
            else:
                self.sheet.append(values)
                r = self.sheet.max_row
                for i, (column, value) in enumerate(zip(self.columns, values, strict=True), start=1):
                    cell = self.sheet.cell(row=r, column=i)
                    if column["kind"] == "money":
                        cell.number_format = self.money_format
                    elif column["kind"] == "date" and not isinstance(value, str):
                        cell.number_format = "dd mmm yyyy"
                    self.widths[i - 1] = min(max(self.widths[i - 1], len(str(value)) + 2), 60)

    def finish(self):
        totals = self.report.get("totals", {})
        reconciliation = self.report.get("reconciliation")
        summary = [(label, value) for label, value in totals.items()]
        if reconciliation:
            if reconciliation.get("applicable") is False:
                text = f'Filtered net movement (debits less credits): {reconciliation["difference"]} {self.currency}; not a full-ledger balance check'
            else:
                text = f'{"Reconciled" if reconciliation["balanced"] else "Review required"}; difference {reconciliation["difference"]} {self.currency}'
            summary.append((reconciliation["label"], text))
        notes = [n for n in self.report.get("notes", []) if n]
        if self.fmt == "csv":
            with open(self.path, "a", encoding="utf-8", newline="") as output:
                writer = csv.writer(output)
                writer.writerow([])
                writer.writerows((safe_text(label), safe_text(value)) for label, value in summary)
                writer.writerows(("Note", safe_text(n)) for n in notes)
        elif self.fmt == "xlsx":
            from openpyxl.styles import Font
            from openpyxl.utils import get_column_letter
            last_col = get_column_letter(len(self.columns))
            if self.sheet.max_row > self.header_row:
                self.sheet.auto_filter.ref = f"A{self.header_row}:{last_col}{self.sheet.max_row}"
            self.sheet.append([])
            for label, value in summary:
                try:
                    number = Decimal(str(value))
                except Exception:  # noqa: BLE001 - text summaries stay text
                    number = None
                self.sheet.append([safe_text(label), number if number is not None else safe_text(value)])
                self.sheet.cell(row=self.sheet.max_row, column=1).font = Font(bold=True)
                if number is not None:
                    self.sheet.cell(row=self.sheet.max_row, column=2).number_format = "#,##0.###" if label in self.report.get("quantity_totals", ()) else self.money_format
            for n in notes:
                self.sheet.append(["Note", safe_text(n)])
            for i, width in enumerate(self.widths, start=1):
                self.sheet.column_dimensions[get_column_letter(i)].width = width
            self.book.save(self.path)
        else:
            self._close_group()
            self.y -= 6
            for label, value in summary:
                if not self._is_number(value):
                    shown = str(value)
                elif label in self.report.get("quantity_totals", ()):  # quantities are counts, never money
                    shown = f"{Decimal(str(value)).normalize():,f}"
                else:
                    shown = format_money(Decimal(str(value)), self.currency)
                para = self._paragraph(f"{label}: {shown}", bold=True)
                height = para.wrap(self.width - self.margin * 2, 400)[1] + 6
                if self.y - height < 42:
                    self._new_page()
                self.y -= height
                para.drawOn(self.canvas, self.margin, self.y + 3)
            for n in notes:
                para = self._paragraph(n, style=self.muted)
                height = para.wrap(self.width - self.margin * 2, 400)[1] + 5
                if self.y - height < 42:
                    self._new_page()
                self.y -= height
                para.drawOn(self.canvas, self.margin, self.y + 3)
            self.canvas.save()

    @staticmethod
    def _is_number(value) -> bool:
        try:
            Decimal(str(value))
            return True
        except Exception:  # noqa: BLE001
            return False


async def export_snapshot(db, user, snapshot_id: uuid.UUID, fmt: str) -> tuple[str, str, str]:
    report = await read_snapshot(db, user, snapshot_id)
    with tempfile.NamedTemporaryFile(prefix="pesaa-financial-", suffix=f".{fmt}", delete=False) as file:
        path = file.name
    try:
        from app.modules.tenants.repository import TenantRepository
        tenant = await TenantRepository(db).get(user.tenant_id)
        repo = ReportingRepository(db)
        from app.modules.accounting.service.report_layouts import LAYOUTS, render
        if fmt == "pdf" and report.get("kind") in LAYOUTS:
            # Each accounting report has its own document layout (statement, register, aging ...), from the same snapshot rows.
            rows = []
            for offset in range(0, report["total"], 500):
                rows += await repo.rows(user.tenant_id, snapshot_id, offset, 500)
            await asyncio.to_thread(render, path, report, rows, tenant)
            media = "application/pdf"
            return path, f'{report["kind"]}-{report["as_of"]}.pdf', media
        writer = await asyncio.to_thread(ExportWriter, path, fmt, report, tenant)
        for offset in range(0, report["total"], 100):
            rows = await repo.rows(user.tenant_id, snapshot_id, offset, 100)
            await asyncio.to_thread(writer.rows, rows)
        await asyncio.to_thread(writer.finish)
    except BaseException:
        os.unlink(path)
        raise
    media = {"pdf": "application/pdf", "csv": "text/csv; charset=utf-8", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}[fmt]
    return path, f'{report["kind"]}-{report["as_of"]}.{fmt}', media
