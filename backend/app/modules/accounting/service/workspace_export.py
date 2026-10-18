"""Stream snapshot rows to bounded export writers; never re-query live financial sources."""
import asyncio
import csv
import os
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

from app.core.currency import format_money
from app.modules.accounting.repository.reporting import ReportingRepository
from app.modules.accounting.service.workspace import read_snapshot


def safe_text(value: object) -> str:
    text = str(value or "")
    return "'" + text if text.lstrip().startswith(("=", "+", "-", "@")) else text


class ExportWriter:
    def __init__(self, path: str, fmt: str, report: dict):
        self.path, self.fmt, self.report = path, fmt, report
        self.columns = report["columns"]
        if fmt == "csv":
            with open(path, "w", encoding="utf-8-sig", newline="") as output:
                writer = csv.writer(output)
                writer.writerow([safe_text(report["business"]), safe_text(report["title"]), report["currency"], safe_text(report["branch"])])
                writer.writerow(["Generated", report["generated_at"], "As of", report["as_of"], "From", report["from_date"], "To", report["to_date"]])
                writer.writerow([c["label"] for c in self.columns])
        elif fmt == "xlsx":
            self.book = Workbook(write_only=True)
            self.sheet = self.book.create_sheet("Financial report")
            self.sheet.append([safe_text(report["business"]), safe_text(report["title"]), report["currency"], safe_text(report["branch"])])
            self.sheet.append(["Generated", report["generated_at"], "As of", report["as_of"], "From", report["from_date"], "To", report["to_date"]])
            self.sheet.append([c["label"] for c in self.columns])
            self.sheet.freeze_panes = "A4"
        else:
            self.canvas = Canvas(path, pagesize=landscape(A4))
            self.canvas.setTitle(report["title"])
            self.canvas.setAuthor(report["business"])
            self.width, self.height = landscape(A4)
            self.margin = 30
            self.page = 0
            weights = [3 if c["key"] in {"name", "account"} else 1.6 if c["kind"] in {"money", "date"} else 1.5 for c in self.columns]
            scale = (self.width - self.margin * 2) / sum(weights)
            self.widths = [w * scale for w in weights]
            self.normal = ParagraphStyle("financial-cell", fontName="Helvetica", fontSize=8, leading=11, textColor=colors.HexColor("#1f2937"))
            self.bold = ParagraphStyle("financial-bold", parent=self.normal, fontName="Helvetica-Bold")
            self._new_page()

    def _paragraph(self, value, bold=False):
        text = str(value or "-").replace("–", "-").replace("—", "-")
        return Paragraph(escape(text), self.bold if bold else self.normal)

    def _new_page(self):
        if self.page:
            self.canvas.showPage()
        self.page += 1
        self.y = self.height - 30
        self.canvas.setFillColor(colors.HexColor("#16a34a"))
        self.canvas.rect(30, self.y - 6, self.width - 60, 3, fill=1, stroke=0)
        self.y -= 25
        for text, size in [(self.report["business"], 13), (self.report["title"], 15),
                           (f'{self.report["branch"]} | {self.report["currency"]} | {self.report["from_date"]} to {self.report["to_date"]} | As of {self.report["as_of"]}', 8)]:
            self.canvas.setFont("Helvetica-Bold" if size > 10 else "Helvetica", size)
            self.canvas.setFillColor(colors.HexColor("#1f2937"))
            self.canvas.drawString(30, self.y, str(text)[:150])
            self.y -= 20
        self._pdf_row([c["label"] for c in self.columns], bold=True, check_page=False)
        self.canvas.setFont("Helvetica", 7)
        self.canvas.setFillColor(colors.HexColor("#64748b"))
        self.canvas.drawString(30, 17, f'Snapshot {self.report["id"]} | {self.report["generated_at"]}')
        self.canvas.drawRightString(self.width - 30, 17, f"Page {self.page}")

    def _pdf_row(self, values, bold=False, check_page=True):
        paragraphs = [self._paragraph(v, bold) for v in values]
        for paragraph, column in zip(paragraphs, self.columns, strict=True):
            if column["kind"] in {"money", "number"}:
                paragraph.style = ParagraphStyle("numeric-cell", parent=paragraph.style, alignment=2)
        heights = [p.wrap(w - 12, 400)[1] for p, w in zip(paragraphs, self.widths, strict=True)]
        height = max(heights, default=12) + 12
        if check_page and self.y - height < 35:
            self._new_page()
        if bold:
            self.canvas.setFillColor(colors.HexColor("#ecfdf3"))
            self.canvas.rect(self.margin, self.y - height, self.width - self.margin * 2, height, fill=1, stroke=0)
        x = self.margin
        for p, width, ph in zip(paragraphs, self.widths, heights, strict=True):
            p.drawOn(self.canvas, x + 6, self.y - 6 - ph)
            x += width
        self.y -= height
        self.canvas.setStrokeColor(colors.HexColor("#e5e7eb"))
        self.canvas.line(self.margin, self.y, self.width - self.margin, self.y)

    def rows(self, rows: list[dict]):
        for row in rows:
            values = []
            for column in self.columns:
                value = row.get(column["key"])
                if column["kind"] in {"money", "number"}:
                    if value is None:
                        value = ""
                    elif self.fmt == "pdf" and column["kind"] == "money":
                        value = format_money(Decimal(str(value)), self.report["currency"])
                    else:
                        value = Decimal(str(value))
                else:
                    value = safe_text(value) if self.fmt != "pdf" else value
                values.append(value)
            if self.fmt == "csv":
                with open(self.path, "a", encoding="utf-8", newline="") as output:
                    csv.writer(output).writerow(values)
            elif self.fmt == "xlsx":
                self.sheet.append(values)
            else:
                self._pdf_row(values)

    def finish(self):
        totals = self.report.get("totals", {})
        reconciliation = self.report.get("reconciliation")
        summary = [(label, str(value)) for label, value in totals.items()]
        if reconciliation:
            summary.append((reconciliation["label"], f'{"Reconciled" if reconciliation["balanced"] else "Review required"}; difference {reconciliation["difference"]} {self.report["currency"]}'))
        summary += [("Note", note) for note in self.report.get("notes", [])]
        if self.fmt == "csv":
            with open(self.path, "a", encoding="utf-8", newline="") as output:
                writer = csv.writer(output)
                writer.writerow([])
                writer.writerows((safe_text(label), safe_text(value)) for label, value in summary)
        elif self.fmt == "xlsx":
            self.sheet.append([])
            for label, value in summary:
                self.sheet.append([safe_text(label), safe_text(value)])
            self.book.save(self.path)
        else:
            for label, value in summary:
                paragraph = self._paragraph(f"{label}: {value}")
                height = paragraph.wrap(self.width - 60, 400)[1] + 10
                if self.y - height < 35:
                    self._new_page()
                self.y -= height
                paragraph.drawOn(self.canvas, 30, self.y + 5)
            self.canvas.save()


async def export_snapshot(db, user, snapshot_id: uuid.UUID, fmt: str) -> tuple[str, str, str]:
    report = await read_snapshot(db, user, snapshot_id)
    with tempfile.NamedTemporaryFile(prefix="pesaa-financial-", suffix=f".{fmt}", delete=False) as file:
        path = file.name
    try:
        writer = await asyncio.to_thread(ExportWriter, path, fmt, report)
        repo = ReportingRepository(db)
        for offset in range(0, report["total"], 100):
            rows = await repo.rows(user.tenant_id, snapshot_id, offset, 100)
            await asyncio.to_thread(writer.rows, rows)
        await asyncio.to_thread(writer.finish)
    except BaseException:
        os.unlink(path)
        raise
    media = {"pdf": "application/pdf", "csv": "text/csv; charset=utf-8", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}[fmt]
    return path, f'{report["kind"]}-{report["as_of"]}.{fmt}', media
