import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.accounting.models.transaction import Transaction
from app.modules.accounting.repository.reporting import ReportingRepository
from app.modules.accounting.schemas.report import (
    BalanceSheet,
    BalanceSheetSection,
    CashFlowLine,
    CashFlowSection,
    CashFlowStatement,
    GeneralLedger,
    IncomeStatement,
    LedgerEntry,
    StatementLine,
    TrialBalance,
    TrialBalanceLine,
)

# Only POSTED transactions affect financial statements.
STATUS_POSTED = "Posted"

# Account code ranges used for statement classification. Codes are strings like "1000".
NON_CURRENT_ASSET_PREFIXES = ("15", "16", "17", "18")
NON_CURRENT_LIABILITY_PREFIXES = ("22", "23", "24")
COGS_PREFIX = "50"          # 5000-5099 → Cost of Goods Sold
OTHER_INCOME_PREFIX = "49"  # 4900-4999 → Other (non-operating) income
CASH_PREFIX = "10"          # 1000-1099 → Cash & cash equivalents


def _account_balances(transactions: list[Transaction]) -> dict[uuid.UUID, dict]:
    """Balance per account = normal-side total − contra-side total (double-entry rule)."""
    agg: dict[uuid.UUID, dict] = {}
    for txn in transactions:
        for line in txn.lines:
            acc = line.account
            bucket = agg.setdefault(acc.id, {"account": acc, "debit_total": Decimal(0), "credit_total": Decimal(0)})
            amt = Decimal(line.amount)
            if line.type == "debit":
                bucket["debit_total"] += amt
            else:
                bucket["credit_total"] += amt
    for bucket in agg.values():
        acc = bucket["account"]
        if acc.normal_balance == "debit":
            bucket["balance"] = round(bucket["debit_total"] - bucket["credit_total"], 2)
        else:
            bucket["balance"] = round(bucket["credit_total"] - bucket["debit_total"], 2)
    return agg


# ── Trial balance ────────────────────────────────────────────────────────────

async def trial_balance(db: AsyncSession, tenant_id: uuid.UUID, from_date: date | None, to_date: date | None, branch_id: uuid.UUID | None = None) -> TrialBalance:
    balances = await ReportingRepository(db).balances(tenant_id, from_date, to_date, branch_id)
    lines: list[TrialBalanceLine] = []
    for bucket in balances.values():
        acc = bucket["account"]
        lines.append(TrialBalanceLine(
            code=acc.code,
            name=acc.name,
            type=acc.type,
            normal_balance=acc.normal_balance,
            debit_total=round(bucket["debit_total"], 2),
            credit_total=round(bucket["credit_total"], 2),
            balance=(bucket["debit_total"] - bucket["credit_total"]) if acc.normal_balance == "debit" else (bucket["credit_total"] - bucket["debit_total"]),
        ))
    lines.sort(key=lambda l: l.code)
    total_debits = round(sum(l.debit_total for l in lines), 2)
    total_credits = round(sum(l.credit_total for l in lines), 2)
    return TrialBalance(
        from_date=from_date, to_date=to_date, accounts=lines,
        total_debits=total_debits, total_credits=total_credits,
        balanced=round(total_debits, 2) == round(total_credits, 2),
    )


# ── Income statement (P&L) ──────────────────────────────────────────────────

async def income_statement(db: AsyncSession, tenant_id: uuid.UUID, from_date: date | None, to_date: date | None, branch_id: uuid.UUID | None = None) -> IncomeStatement:
    balances = await ReportingRepository(db).balances(tenant_id, from_date, to_date, branch_id)

    revenue_accounts: list[StatementLine] = []
    other_income: list[StatementLine] = []
    cogs_accounts: list[StatementLine] = []
    operating_expense_accounts: list[StatementLine] = []

    for bucket in balances.values():
        acc = bucket["account"]
        if round(bucket["balance"], 2) == 0:
            continue
        line = StatementLine(code=acc.code, name=acc.name, amount=bucket["balance"])
        if acc.type == "Revenue":
            if acc.code.startswith(OTHER_INCOME_PREFIX):
                other_income.append(line)
            else:
                revenue_accounts.append(line)
        elif acc.type == "Expense":
            if acc.code.startswith(COGS_PREFIX):
                cogs_accounts.append(line)
            else:
                operating_expense_accounts.append(line)

    revenue_accounts.sort(key=lambda l: l.code)
    other_income.sort(key=lambda l: l.code)
    cogs_accounts.sort(key=lambda l: l.code)
    operating_expense_accounts.sort(key=lambda l: l.code)

    total_revenue = round(sum(l.amount for l in revenue_accounts), 2)
    total_other_income = round(sum(l.amount for l in other_income), 2)
    total_cogs = round(sum(l.amount for l in cogs_accounts), 2)
    total_operating_expenses = round(sum(l.amount for l in operating_expense_accounts), 2)

    gross_profit = round(total_revenue - total_cogs, 2)
    operating_income = round(gross_profit - total_operating_expenses, 2)
    net_income = round(operating_income + total_other_income, 2)

    return IncomeStatement(
        from_date=from_date, to_date=to_date,
        revenue_accounts=revenue_accounts,
        total_revenue=total_revenue,
        cogs_accounts=cogs_accounts,
        total_cogs=total_cogs,
        gross_profit=gross_profit,
        operating_expense_accounts=operating_expense_accounts,
        total_operating_expenses=total_operating_expenses,
        operating_income=operating_income,
        other_income=other_income,
        total_other_income=total_other_income,
        net_income=net_income,
        net_margin_pct=round(net_income / total_revenue * 100, 1) if total_revenue else None,
    )


# ── Balance sheet ────────────────────────────────────────────────────────────

def _section(title: str, accounts: list[StatementLine]) -> BalanceSheetSection:
    return BalanceSheetSection(title=title, accounts=accounts, total=round(sum(a.amount for a in accounts), 2))


async def balance_sheet(db: AsyncSession, tenant_id: uuid.UUID, as_of: date, branch_id: uuid.UUID | None = None) -> BalanceSheet:
    balances = await ReportingRepository(db).balances(tenant_id, to_date=as_of, branch_id=branch_id)

    current_assets: list[StatementLine] = []
    non_current_assets: list[StatementLine] = []
    current_liabilities: list[StatementLine] = []
    non_current_liabilities: list[StatementLine] = []
    equity_accounts: list[StatementLine] = []
    revenue_total = Decimal(0)
    expense_total = Decimal(0)

    for bucket in balances.values():
        acc = bucket["account"]
        amount = round(bucket["balance"], 2)
        if round(amount, 2) == 0:
            continue
        if acc.type == "Assets":
            if acc.code.startswith(NON_CURRENT_ASSET_PREFIXES):
                non_current_assets.append(StatementLine(code=acc.code, name=acc.name, amount=amount))
            else:
                current_assets.append(StatementLine(code=acc.code, name=acc.name, amount=amount))
        elif acc.type == "Liabilities":
            if acc.code.startswith(NON_CURRENT_LIABILITY_PREFIXES):
                non_current_liabilities.append(StatementLine(code=acc.code, name=acc.name, amount=amount))
            else:
                current_liabilities.append(StatementLine(code=acc.code, name=acc.name, amount=amount))
        elif acc.type == "Equity":
            equity_accounts.append(StatementLine(code=acc.code, name=acc.name, amount=amount))
        elif acc.type == "Revenue":
            revenue_total += amount
        elif acc.type == "Expense":
            expense_total += amount

    for group in (current_assets, non_current_assets, current_liabilities, non_current_liabilities, equity_accounts):
        group.sort(key=lambda l: l.code)

    # Retained earnings = cumulative net income through the as-of date
    # (Revenue and Expense are both closed into equity each period).
    retained_earnings = round(revenue_total - expense_total, 2)

    total_assets = round(sum(a.amount for a in current_assets) + sum(a.amount for a in non_current_assets), 2)
    total_liabilities = round(sum(a.amount for a in current_liabilities) + sum(a.amount for a in non_current_liabilities), 2)
    equity_total = round(sum(a.amount for a in equity_accounts) + retained_earnings, 2)
    total_lie = round(total_liabilities + equity_total, 2)

    return BalanceSheet(
        as_of=as_of,
        current_assets=_section("Current Assets", current_assets),
        non_current_assets=_section("Non-Current Assets", non_current_assets),
        total_assets=total_assets,
        current_liabilities=_section("Current Liabilities", current_liabilities),
        non_current_liabilities=_section("Non-Current Liabilities", non_current_liabilities),
        total_liabilities=total_liabilities,
        equity_accounts=equity_accounts,
        retained_earnings=retained_earnings,
        total_equity=equity_total,
        total_liabilities_and_equity=total_lie,
        in_balance=round(total_assets, 2) == round(total_lie, 2),
        difference=round(total_assets - total_lie, 2),
    )


# ── Cash flow statement (direct method) ─────────────────────────────────────

def _cashflow_section(account) -> str:
    t = account.type
    code = account.code or ""
    if t in ("Revenue", "Expense"):
        return "operating"
    if t == "Assets":
        return "investing" if code.startswith(NON_CURRENT_ASSET_PREFIXES) else "operating"
    if t == "Liabilities":
        return "financing" if code.startswith(NON_CURRENT_LIABILITY_PREFIXES) else "operating"
    if t == "Equity":
        return "financing"
    return "operating"


def _section_from_map(title: str, mapping: dict[tuple[str, str], float]) -> CashFlowSection:
    lines = [
        CashFlowLine(account_code=code, account_name=name, amount=round(amount, 2))
        for (code, name), amount in sorted(mapping.items(), key=lambda kv: kv[0][0])
    ]
    return CashFlowSection(title=title, lines=lines, total=round(sum(l.amount for l in lines), 2))


async def cash_flow(db: AsyncSession, tenant_id: uuid.UUID, from_date: date | None, to_date: date | None, branch_id: uuid.UUID | None = None) -> CashFlowStatement:
    from app.modules.accounting.service.cashflow import calculate_cash_flow
    return await calculate_cash_flow(db, tenant_id, from_date, to_date, branch_id)


# ── General ledger ──────────────────────────────────────────────────────────

async def general_ledger(
    db: AsyncSession, tenant_id: uuid.UUID, from_date: date | None, to_date: date | None,
    account_id: uuid.UUID | None = None, branch_id: uuid.UUID | None = None,
    offset: int = 0, limit: int = 100,
) -> GeneralLedger:
    from app.core.exceptions import NotFoundError
    from app.modules.accounting.repository.account import AccountRepository
    repo = ReportingRepository(db)
    await repo.integrity(tenant_id, branch_id)
    account = await AccountRepository(db).get_by_id_for_tenant(tenant_id, account_id) if account_id else None
    if account_id and account is None:
        raise NotFoundError("Account not found")
    rows, totals = await repo.ledger_page(tenant_id, from_date, to_date, account_id, branch_id, offset, limit)
    entries = [LedgerEntry(transaction_id=txn.id, reference=txn.reference, date=txn.transaction_date,
                           description=line.description or txn.description, type=txn.type,
                           debit=Decimal(line.amount) if line.type == "debit" else Decimal(0),
                           credit=Decimal(line.amount) if line.type == "credit" else Decimal(0)) for line, txn, _ in rows]
    return GeneralLedger(from_date=from_date, to_date=to_date, account_id=account_id,
                         account_code=account.code if account else None, account_name=account.name if account else None,
                         entries=entries, total_debits=totals.debit, total_credits=totals.credit,
                         balance=totals.debit - totals.credit, total=totals.total, offset=offset, limit=min(limit, 100))
