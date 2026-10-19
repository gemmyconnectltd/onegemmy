"""One financial workspace over the existing GL, sales, purchasing and inventory sources."""
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.branches import branch_allowed
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.modules.accounting.models.workspace import (
    AccountingPreference,
    FinancialSnapshot,
    FinancialSnapshotRow,
)
from app.modules.accounting.repository.reporting import ReportingRepository
from app.modules.accounting.repository.subledgers import SubledgerRepository
from app.modules.accounting.schemas.workspace import ReportRequest
from app.modules.accounting.service import statements
from app.modules.tenants.models import Branch, Tenant, User
from app.modules.tenants.repository import BranchRepository

ZERO = Decimal(0)
TITLES = {"income-statement": "Income Statement / Profit & Loss", "balance-sheet": "Balance Sheet", "cash-flow": "Cash Flow Statement",
          "equity": "Statement of Changes in Equity", "trial-balance": "Trial Balance", "receivables-aging": "Accounts Receivable Aging",
          "payables-aging": "Accounts Payable Aging", "inventory": "Inventory / Stock Report", "general-ledger": "General Ledger"}


def allow(user: User, resource: str, action: str = "read") -> uuid.UUID:
    if user.tenant_id is None:
        raise ValidationError("This account has no tenant")
    if not user.is_superuser and f"{resource}:{action}" not in user.permissions_names:
        raise ForbiddenError(f"Permission required: {resource}:{action}")
    return user.tenant_id


def report_permission(user: User, kind: str) -> uuid.UUID:
    resource = {"receivables-aging": "accounts_receivable", "payables-aging": "accounts_payable", "inventory": "items", "chart-of-accounts": "chart_of_accounts"}.get(kind, "journal_entries")
    return allow(user, resource)


async def resolve_branch(db: AsyncSession, user: User, requested: uuid.UUID | None,
                         active: uuid.UUID | None = None) -> uuid.UUID | None:
    branch_id = requested or active
    if getattr(user, "branch_ids", None) is not None:
        allowed = {uuid.UUID(str(id)) for id in user.branch_ids}
        branch_id = branch_id or user.branch_id
        if not branch_id and len(allowed) == 1:
            branch_id = next(iter(allowed))
        if not branch_id or branch_id not in allowed:
            raise ForbiddenError("Select an assigned branch; company-wide access is not granted")
    elif user.branch_id:
        if branch_id and branch_id != user.branch_id:
            raise ForbiddenError("This account is restricted to its assigned branch")
        branch_id = user.branch_id
    if branch_id and await BranchRepository(db).get_by_id_for_tenant(user.tenant_id, branch_id) is None:
        raise NotFoundError("Branch not found")
    return branch_id


def encoded(value):
    if isinstance(value, (Decimal, uuid.UUID)):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: encoded(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [encoded(v) for v in value]
    return value


def columns(*fields: tuple[str, str, str]) -> list[dict]:
    return [{"key": key, "label": label, "kind": kind} for key, label, kind in fields]


async def preference(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    record = await db.get(AccountingPreference, tenant_id)
    return {"fiscal_start_month": record.fiscal_start_month if record else 1, "inventory_method": "unit_cost", "ledger_currency": (await db.get(Tenant, tenant_id)).currency}


async def generate(db: AsyncSession, user: User, data: ReportRequest,
                   active_branch: uuid.UUID | None = None) -> dict:
    tenant_id = report_permission(user, data.kind)
    branch_id = await resolve_branch(db, user, data.branch_id, active_branch)
    repo = ReportingRepository(db)
    await repo.integrity(tenant_id, branch_id)
    tenant = await db.get(Tenant, tenant_id)
    prefs = await preference(db, tenant_id)
    today = datetime.now(UTC).date()
    as_of = data.as_of or data.to_date or today
    month = prefs["fiscal_start_month"]
    start_year = as_of.year if as_of.month >= month else as_of.year - 1
    start, end = data.from_date or date(start_year, month, 1), data.to_date or as_of
    if start > end:
        raise ValidationError("From date must be on or before to date")
    if data.kind == "inventory" and (branch_id or as_of != today):
        raise ValidationError("Stock uses the inventory system's current unit-cost balances across the business. Historical or branch stock quantities are not recorded; select All branches and today's date.")
    snapshot = FinancialSnapshot(tenant_id=tenant_id, kind=data.kind, branch_id=branch_id, created_by=user.id, data={})
    db.add(snapshot)
    await db.flush()
    branch = await db.get(Branch, branch_id) if branch_id else None
    metadata = {"kind": data.kind, "title": TITLES[data.kind], "business": tenant.name, "currency": tenant.currency,
                "branch_id": str(branch_id) if branch_id else None, "branch": branch.name if branch else "All branches",
                "from_date": start.isoformat(), "to_date": end.isoformat(), "as_of": as_of.isoformat(),
                "generated_at": datetime.now(UTC).isoformat(), "totals": {}, "notes": [],
                "columns": columns(("section", "Section", "text"), ("code", "Code", "text"), ("name", "Account", "text"), ("amount", "Amount", "money"))}
    if branch_id:
        metadata["notes"].append("Branch reports include journals attributed to this branch. Older unassigned journals remain in All branches; no historical branch balance is inferred.")
    pending = []
    count = 0

    async def append(row: dict):
        nonlocal count
        pending.append({"snapshot_id": snapshot.id, "tenant_id": tenant_id, "position": count, "data": encoded(row)})
        count += 1
        if len(pending) >= 100:
            await db.execute(insert(FinancialSnapshotRow), pending)
            pending.clear()

    async def section(label, lines):
        for line in lines:
            await append({"section": label, "code": line.code, "name": line.name, "amount": line.amount})

    kind = data.kind
    if kind == "income-statement":
        report = await statements.income_statement(db, tenant_id, start, end, branch_id)
        for label, lines in [("Revenue", report.revenue_accounts), ("Cost of goods sold", report.cogs_accounts),
                             ("Operating expenses", report.operating_expense_accounts), ("Other income", report.other_income)]:
            await section(label, lines)
        metadata["totals"] = {"Revenue": report.total_revenue, "Cost of goods sold": report.total_cogs,
                              "Gross profit": report.gross_profit, "Operating expenses": report.total_operating_expenses,
                              "Other income": report.total_other_income, "Net profit": report.net_income}
    elif kind == "balance-sheet":
        report = await statements.balance_sheet(db, tenant_id, as_of, branch_id)
        for label, lines in [("Current assets", report.current_assets.accounts), ("Non-current assets", report.non_current_assets.accounts),
                             ("Current liabilities", report.current_liabilities.accounts), ("Non-current liabilities", report.non_current_liabilities.accounts),
                             ("Equity", report.equity_accounts)]:
            await section(label, lines)
        await append({"section": "Equity", "name": "Retained earnings from posted income and expenses", "code": "—", "amount": report.retained_earnings})
        metadata["totals"] = {"Assets": report.total_assets, "Liabilities": report.total_liabilities, "Equity": report.total_equity,
                              "Liabilities + equity": report.total_liabilities_and_equity}
        metadata["reconciliation"] = {"balanced": report.in_balance, "difference": report.difference, "label": "Assets = liabilities + equity"}
    elif kind == "cash-flow":
        report = await statements.cash_flow(db, tenant_id, start, end, branch_id)
        for group in [report.operating, report.investing, report.financing]:
            for line in group.lines:
                await append({"section": group.title, "code": line.account_code, "name": line.account_name, "amount": line.amount})
        metadata["totals"] = {"Operating": report.operating.total, "Investing": report.investing.total, "Financing": report.financing.total,
                              "Net change": report.net_cash_change, "Opening cash": report.beginning_cash, "Closing cash": report.ending_cash}
        difference = report.ending_cash - report.beginning_cash - report.net_cash_change
        metadata["reconciliation"] = {"balanced": abs(difference) < Decimal("0.01"), "difference": difference, "label": "Opening cash + net change = closing ledger cash"}
        metadata["notes"].append("Cash equivalents use existing account codes 10xx. Transfers between cash accounts are excluded. Compound journals allocate net cash proportionately to opposite-side noncash accounts; noncash components are excluded.")
    elif kind == "equity":
        opening = await statements.balance_sheet(db, tenant_id, start - timedelta(days=1), branch_id)
        closing = await statements.balance_sheet(db, tenant_id, end, branch_id)
        income = await statements.income_statement(db, tenant_id, start, end, branch_id)
        moves = await repo.balances(tenant_id, start, end, branch_id)
        equity_moves = sum((b["balance"] for b in moves.values() if b["account"].type == "Equity"), ZERO)
        for name, amount in [("Opening equity", opening.total_equity), ("Net profit / loss", income.net_income), ("Direct equity movements", equity_moves), ("Closing equity", closing.total_equity)]:
            await append({"section": "Equity bridge", "name": name, "code": "—", "amount": amount})
        difference = closing.total_equity - opening.total_equity - income.net_income - equity_moves
        metadata["totals"] = {"Opening equity": opening.total_equity, "Profit / loss": income.net_income, "Equity movements": equity_moves, "Closing equity": closing.total_equity}
        metadata["reconciliation"] = {"balanced": abs(difference) < Decimal("0.01"), "difference": difference, "label": "Opening equity + profit + equity movements = closing equity"}
    elif kind == "trial-balance":
        report = await statements.trial_balance(db, tenant_id, None, as_of, branch_id)
        for line in report.accounts:
            await append({"code": line.code, "name": line.name, "type": line.type, "debit": line.debit_total, "credit": line.credit_total, "amount": line.balance})
        metadata["columns"] = columns(("code", "Code", "text"), ("name", "Account", "text"), ("type", "Type", "text"), ("debit", "Debits", "money"), ("credit", "Credits", "money"), ("amount", "Normal balance", "money"))
        metadata["totals"] = {"Debits": report.total_debits, "Credits": report.total_credits}
        metadata["reconciliation"] = {"balanced": report.balanced, "difference": report.total_debits - report.total_credits, "label": "Debits = credits through the as-of date"}
    elif kind in {"receivables-aging", "payables-aging"}:
        totals = dict.fromkeys(["current", "days_1_30", "days_31_60", "days_61_90", "over_90"], ZERO)
        async for row in SubledgerRepository(db).aging(tenant_id, as_of, kind == "payables-aging", branch_id):
            totals[row["bucket"]] += Decimal(row["amount"])
            await append(row)
        metadata["columns"] = columns(("name", "Supplier" if kind == "payables-aging" else "Customer", "text"), ("reference", "Bill" if kind == "payables-aging" else "Invoice", "text"),
                                      ("due_date", "Due date", "date"), ("due_note", "Terms", "text"), ("amount", "Outstanding (base)", "money"), ("age", "Days overdue", "number"), ("status", "Status", "text"))
        total = sum(totals.values(), ZERO)
        metadata["totals"] = {"Total outstanding": total, "Current": totals["current"], "1–30 days": totals["days_1_30"], "31–60 days": totals["days_31_60"], "61–90 days": totals["days_61_90"], "Over 90 days": totals["over_90"]}
        control = "2000" if kind == "payables-aging" else "1100"
        balances = await repo.balances(tenant_id, to_date=as_of, branch_id=branch_id)
        ledger = sum((b["balance"] for b in balances.values() if b["account"].code == control), ZERO)
        metadata["reconciliation"] = {"balanced": total == ledger, "difference": total - ledger, "label": f"Subledger outstanding versus GL control account {control}"}
        metadata["notes"].append("Legacy due dates before the issue date are flagged for review; no historical terms are silently changed. Balances use source invoices/bills and applied payments at frozen document exchange rates. No due date means Current (not overdue). Reconciliation differences require review; no balancing journal is inserted.")
    elif kind == "inventory":
        total, units = ZERO, ZERO
        async for row in SubledgerRepository(db).inventory(tenant_id):
            total += Decimal(row["amount"])
            units += Decimal(row["quantity"])
            await append(row)
        metadata["columns"] = columns(("code", "SKU", "text"), ("name", "Product / variant", "text"), ("quantity", "Quantity", "number"), ("unit_cost", "Unit cost", "money"), ("amount", "Stock value", "money"))
        metadata["totals"] = {"Inventory value": total}
        metadata["quantity"] = str(units)
        balances = await repo.balances(tenant_id, to_date=as_of)
        ledger = sum((b["balance"] for b in balances.values() if b["account"].code == "1200"), ZERO)
        metadata["reconciliation"] = {"balanced": total == ledger, "difference": total - ledger, "label": "Current inventory valuation versus GL inventory control (1200)"}
        metadata["notes"].append("Uses the inventory service's configured unit_cost method: recorded product/active-variant unit cost × current stock. Parent quantities are excluded when variants are used. No FIFO or historical quantity is inferred.")
    else:
        if data.account_id:
            from app.modules.accounting.repository import AccountRepository
            if await AccountRepository(db).get_by_id_for_tenant(tenant_id, data.account_id) is None:
                raise NotFoundError("Account not found")
        async for row in repo.source_lines(tenant_id, start, end, branch_id, data.account_id, data.search, data.cash_only):
            await append(row)
        metadata["columns"] = columns(("date", "Date", "date"), ("reference", "Journal", "text"), ("transaction_reference", "Source reference", "text"), ("name", "Description", "text"),
                                      ("account", "Account", "text"), ("debit", "Debit", "money"), ("credit", "Credit", "money"), ("status", "Status", "text"))
    if pending:
        await db.execute(insert(FinancialSnapshotRow), pending)
    if kind == "general-ledger":
        totals = await repo.row_totals(tenant_id, snapshot.id, ["debit", "credit"])
        metadata["totals"] = {"Debits": totals["debit"], "Credits": totals["credit"]}
        metadata["reconciliation"] = {"balanced": totals["debit"] == totals["credit"], "difference": totals["debit"] - totals["credit"],
                                      "applicable": not (data.account_id or data.search or data.cash_only), "label": "Account / search movement" if data.account_id or data.search or data.cash_only else "Posted debits = posted credits"}
    metadata["row_count"] = count
    snapshot.data = encoded(metadata)
    await db.flush()
    from app.modules.audit.service import record_audit
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user.id, action="report.generate", entity_type="financial_report", entity_id=str(snapshot.id), summary=f"Generated {TITLES[kind]}")
    await db.commit()
    return await read_snapshot(db, user, snapshot.id)


async def read_snapshot(db: AsyncSession, user: User, snapshot_id: uuid.UUID, page: int = 1, page_size: int = 50) -> dict:
    repo = ReportingRepository(db)
    if user.tenant_id is None:
        raise ValidationError("This account has no tenant")
    snapshot = await repo.snapshot(user.tenant_id, snapshot_id)
    if snapshot is None:
        raise NotFoundError("Report not found")
    report_permission(user, snapshot.kind)
    if snapshot.kind != "chart-of-accounts" and not branch_allowed(user, snapshot.branch_id):
        raise ForbiddenError("Report is outside the assigned branch")
    return {"id": str(snapshot.id), **snapshot.data, "rows": await repo.rows(user.tenant_id, snapshot.id, (page - 1) * page_size, page_size),
            "page": page, "page_size": page_size, "total": snapshot.data["row_count"]}


async def journal_detail(db, user, journal_id):
    from app.core.exceptions import ForbiddenError, NotFoundError
    from app.modules.accounting.repository.transaction import TransactionRepository
    from app.modules.accounting.schemas.transaction import TransactionRead
    tenant_id = allow(user, "journal_entries")
    row = await TransactionRepository(db).get_by_id_for_tenant(tenant_id, journal_id)
    if row is None:
        raise NotFoundError("Journal not found")
    if not branch_allowed(user, row.branch_id):
        raise ForbiddenError("Journal is outside the assigned branch")
    if any(line.account is None or line.account.tenant_id != tenant_id for line in row.lines):
        raise ValidationError("Journal contains invalid account ownership; finance review required")
    return TransactionRead.model_validate(row).model_dump()


async def source_document(db, user, document_id, payable):
    from app.modules.procurement.repository import SupplierBillRepository
    from app.modules.procurement.service.supplier_bill import get_bill
    from app.modules.sales.repository import OrderRepository
    from app.modules.sales.service.order import get_order
    tenant_id = allow(user, "accounts_payable" if payable else "accounts_receivable")
    row = await (SupplierBillRepository(db) if payable else OrderRepository(db)).get_by_id_for_tenant(tenant_id, document_id)
    if row is None:
        raise NotFoundError("Source document not found")
    if payable and (row.purchase_order is None or row.purchase_order.tenant_id != tenant_id):
        raise NotFoundError("Source purchase not found")
    contact = row.supplier if payable else row.customer
    if contact is not None and contact.tenant_id != tenant_id:
        raise ValidationError("Source document contains invalid contact ownership")
    branch_id = row.purchase_order.branch_id if payable else row.branch_id
    if not branch_allowed(user, branch_id):
        raise ForbiddenError("Document is outside the assigned branch")
    document = await get_bill(db, tenant_id, document_id) if payable else await get_order(db, tenant_id, document_id)
    return document.model_dump()
