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


def test_every_accounting_report_has_its_own_layout_and_renders_with_and_without_rows(tmp_path):
    import pytest

    from app.modules.accounting.service.report_layouts import BUILDERS, render

    samples = {
        "balance-sheet": [{"section": "Current assets", "code": "1000", "name": "Cash", "amount": "100"},
                          {"section": "Current assets", "code": "1200", "name": "Inventory", "amount": "-40"},
                          {"section": "Current liabilities", "code": "2100", "name": "VAT Payable", "amount": "18"},
                          {"section": "Equity", "code": "—", "name": "Retained earnings", "amount": "42"}],
        "income-statement": [{"section": "Revenue", "code": "4000", "name": "Sales", "amount": "100"},
                             {"section": "Cost of goods sold", "code": "5000", "name": "COGS", "amount": "60"}],
        "cash-flow": [{"section": "Operating activities", "code": "4000", "name": "Sales", "amount": "100"}],
        "equity": [{"section": "Equity bridge", "name": "Opening equity", "amount": "0"}, {"section": "Equity bridge", "name": "Closing equity", "amount": "40"}],
        "trial-balance": [{"code": "1000", "name": "Cash", "type": "Assets", "amount": "100"}, {"code": "4000", "name": "Sales", "type": "Revenue", "amount": "100"}],
        "general-ledger": [{"date": "2026-11-02", "reference": "TXN-1", "transaction_reference": "Sale SO-1", "name": "Cash", "account": "1000 · Cash", "debit": "100", "credit": "0"}],
        "receivables-aging": [{"name": "Alexis", "reference": "ORD-1", "due_date": "2026-10-01", "amount": "50", "bucket": "days_31_60"}],
        "payables-aging": [{"name": "Supplier", "reference": "BILL-1", "due_date": None, "amount": "20", "bucket": "current"}],
        "inventory": [{"code": "SKU", "name": "Phone", "quantity": "-2", "unit_cost": "10", "amount": "-20"}],
    }
    assert set(samples) == set(BUILDERS)  # a new report kind needs a layout and a sample here
    for kind, rows in samples.items():
        for data in (rows, []):
            meta, _ = report()
            meta.update(kind=kind, title=kind.replace("-", " ").title(), totals={}, reconciliation={"balanced": True, "difference": "0", "label": "check"})
            path = tmp_path / f"{kind}-{len(data)}.pdf"
            render(str(path), meta, data, TENANT)
            content = path.read_bytes()
            assert content.startswith(b"%PDF"), kind
            assert re.findall(rb"/Type /Page\b", content), kind
    pytest.importorskip("openpyxl")
