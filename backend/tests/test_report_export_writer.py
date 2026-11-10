"""The shared export writer behind snapshot reports (General Ledger, Trial Balance ...), debt statements and purchase orders."""
import re
import uuid
from types import SimpleNamespace

from openpyxl import load_workbook

from app.modules.accounting.repository.reporting import source_label
from app.modules.accounting.service.workspace_export import ExportWriter

TENANT = SimpleNamespace(name="Kigali Hardware Ltd", logo_url=None, brand_color="#0F766E", address="KN 4 Ave", city="Kigali", country="Rwanda",
                         phone="+250 788 000 000", email=None, website=None, tin="102345678", vat_enabled=True, vat_number="VAT-1")
COLUMNS = [{"key": k, "label": label, "kind": t} for k, label, t in (
    ("date", "Date", "date"), ("reference", "Journal", "text"), ("transaction_reference", "Source reference", "text"),
    ("name", "Description", "text"), ("account", "Account", "text"), ("debit", "Debit", "money"), ("credit", "Credit", "money"), ("status", "Status", "text"))]


def report(rows: int = 0) -> tuple[dict, list[dict]]:
    meta = {"id": str(uuid.uuid4()), "kind": "general-ledger", "title": "General Ledger", "business": TENANT.name, "currency": "RWF",
            "branch": "All branches", "from_date": "2026-11-01", "to_date": "2026-11-10", "as_of": "2026-11-10",
            "generated_at": "2026-11-10T14:05:00+00:00", "columns": COLUMNS, "totals": {"Debits": "0", "Credits": "0"}, "notes": []}
    lines = []
    for j in range(rows):
        tid = str(uuid.uuid4())
        lines += [{"transaction_id": tid, "date": "2026-11-02", "reference": f"TXN-{j:04d}", "transaction_reference": f"Sale SO-{j}",
                   "name": "Cash " * 30, "account": "1000 · Cash", "debit": "1180", "credit": "0", "status": "Posted"},
                  {"transaction_id": tid, "date": "2026-11-02", "reference": f"TXN-{j:04d}", "transaction_reference": f"Sale SO-{j}",
                   "name": "Revenue", "account": "4000 · Sales Revenue", "debit": "0", "credit": "1180", "status": "Posted"}]
    return meta, lines


def write(tmp_path, fmt: str, rows: int, tenant=TENANT) -> str:
    meta, lines = report(rows)
    path = str(tmp_path / f"report.{fmt}")
    writer = ExportWriter(path, fmt, meta, tenant)
    writer.rows(lines)
    writer.finish()
    return path


def test_long_ledger_pdf_paginates_with_business_title_and_total_pages(tmp_path):
    data = open(write(tmp_path, "pdf", 60), "rb").read()
    assert data.startswith(b"%PDF")
    pages = len(re.findall(rb"/Type /Page\b", data))
    assert pages > 1
    assert b"General Ledger - Kigali Hardware Ltd" in data  # the business, not the software vendor, owns the document


def test_empty_report_and_missing_branding_still_render(tmp_path):
    bare = SimpleNamespace(name="Shop", logo_url=None, brand_color=None)
    data = open(write(tmp_path, "pdf", 0, tenant=bare), "rb").read()
    assert data.startswith(b"%PDF") and len(re.findall(rb"/Type /Page\b", data)) == 1


def test_excel_keeps_numbers_dates_and_a_usable_header(tmp_path):
    sheet = load_workbook(write(tmp_path, "xlsx", 3)).active
    assert sheet.title == "General Ledger"
    header = next(r for r in range(1, 12) if sheet.cell(r, 1).value == "Date")
    assert sheet.freeze_panes == f"A{header + 1}" and sheet.auto_filter.ref.startswith(f"A{header}")
    first = [c for c in sheet[header + 1]]
    assert isinstance(first[5].value, int | float) and first[5].number_format == "#,##0"
    assert first[0].is_date


def test_source_reference_is_the_document_number_not_an_internal_id():
    txn = SimpleNamespace(type="sale")
    assert source_label(txn, "SO-1001") == "Sale SO-1001"
    assert source_label(SimpleNamespace(type="manual")) == "Manual journal"
