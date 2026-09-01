import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.accounting.models.transaction import Transaction
from app.modules.accounting.models.transaction_line import TransactionLine
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


async def _load_posted(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    from_date: date | None = None,
    to_date: date | None = None,
    as_of: date | None = None,
) -> list[Transaction]:
    stmt = (
        select(Transaction)
        .options(selectinload(Transaction.lines).selectinload(TransactionLine.account))
        .where(Transaction.tenant_id == tenant_id, Transaction.status == STATUS_POSTED)
    )
    if as_of is not None:
        stmt = stmt.where(Transaction.transaction_date <= as_of)
    else:
        if from_date is not None:
            stmt = stmt.where(Transaction.transaction_date >= from_date)
        if to_date is not None:
            stmt = stmt.where(Transaction.transaction_date <= to_date)
    result = await db.execute(stmt)
    return list(result.scalars().all())


def _account_balances(transactions: list[Transaction]) -> dict[uuid.UUID, dict]:
    """Balance per account = normal-side total − contra-side total (double-entry rule)."""
    agg: dict[uuid.UUID, dict] = {}
    for txn in transactions:
        for line in txn.lines:
            acc = line.account
            bucket = agg.setdefault(acc.id, {"account": acc, "debit_total": 0.0, "credit_total": 0.0})
            amt = float(line.amount)
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

async def trial_balance(db: AsyncSession, tenant_id: uuid.UUID, from_date: date | None, to_date: date | None) -> TrialBalance:
    txns = await _load_posted(db, tenant_id, from_date=from_date, to_date=to_date)
    lines: list[TrialBalanceLine] = []
    for bucket in _account_balances(txns).values():
        acc = bucket["account"]
        lines.append(TrialBalanceLine(
            code=acc.code,
            name=acc.name,
            type=acc.type,
            normal_balance=acc.normal_balance,
            debit_total=round(bucket["debit_total"], 2),
            credit_total=round(bucket["credit_total"], 2),
            balance=bucket["balance"],
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

async def income_statement(db: AsyncSession, tenant_id: uuid.UUID, from_date: date | None, to_date: date | None) -> IncomeStatement:
    txns = await _load_posted(db, tenant_id, from_date=from_date, to_date=to_date)
    balances = _account_balances(txns)

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


async def balance_sheet(db: AsyncSession, tenant_id: uuid.UUID, as_of: date) -> BalanceSheet:
    txns = await _load_posted(db, tenant_id, as_of=as_of)
    balances = _account_balances(txns)

    current_assets: list[StatementLine] = []
    non_current_assets: list[StatementLine] = []
    current_liabilities: list[StatementLine] = []
    non_current_liabilities: list[StatementLine] = []
    equity_accounts: list[StatementLine] = []
    revenue_total = 0.0
    expense_total = 0.0

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


async def cash_flow(db: AsyncSession, tenant_id: uuid.UUID, from_date: date | None, to_date: date | None) -> CashFlowStatement:
    txns = await _load_posted(db, tenant_id, from_date=from_date, to_date=to_date)
    balances = _account_balances(txns)

    cash_account_ids = {
        acc_id for acc_id, bucket in balances.items()
        if bucket["account"].type == "Assets" and (bucket["account"].code or "").startswith(CASH_PREFIX)
    }

    sections: dict[str, dict[tuple[str, str], float]] = {"operating": {}, "investing": {}, "financing": {}}
    for txn in txns:
        for cash_line in txn.lines:
            if cash_line.account_id not in cash_account_ids:
                continue
            # Direct method: cash debit = inflow (+), cash credit = outflow (−).
            signed = float(cash_line.amount) if cash_line.type == "debit" else -float(cash_line.amount)
            for other in txn.lines:
                if other.account_id == cash_line.account_id:
                    continue  # skip cash-to-cash transfers
                section = _cashflow_section(other.account)
                key = (other.account.code, other.account.name)
                sections[section][key] = sections[section].get(key, 0.0) + signed

    operating = _section_from_map("Operating Activities", sections["operating"])
    investing = _section_from_map("Investing Activities", sections["investing"])
    financing = _section_from_map("Financing Activities", sections["financing"])
    net_cash_change = round(operating.total + investing.total + financing.total, 2)

    # Beginning cash = cash balance up to the day before the period start.
    beginning_cash = 0.0
    if from_date is not None:
        prev = await _load_posted(db, tenant_id, as_of=from_date - timedelta(days=1))
        for bucket in _account_balances(prev).values():
            acc = bucket["account"]
            if acc.type == "Assets" and (acc.code or "").startswith(CASH_PREFIX):
                beginning_cash += bucket["balance"]
    beginning_cash = round(beginning_cash, 2)

    return CashFlowStatement(
        from_date=from_date, to_date=to_date,
        operating=operating, investing=investing, financing=financing,
        net_cash_change=net_cash_change,
        beginning_cash=beginning_cash,
        ending_cash=round(beginning_cash + net_cash_change, 2),
    )


# ── General ledger ──────────────────────────────────────────────────────────

async def general_ledger(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    from_date: date | None,
    to_date: date | None,
    account_id: uuid.UUID | None = None,
) -> GeneralLedger:
    txns = await _load_posted(db, tenant_id, from_date=from_date, to_date=to_date)
    entries: list[LedgerEntry] = []
    account_code: str | None = None
    account_name: str | None = None
    debit_total = 0.0
    credit_total = 0.0

    for txn in txns:
        for line in txn.lines:
            if account_id is not None and line.account_id != account_id:
                continue
            amount = float(line.amount)
            debit = amount if line.type == "debit" else 0.0
            credit = amount if line.type == "credit" else 0.0
            debit_total += debit
            credit_total += credit
            if account_id is not None:
                account_code = line.account.code
                account_name = line.account.name
            entries.append(LedgerEntry(
                transaction_id=txn.id,
                reference=txn.reference,
                date=txn.transaction_date,
                description=line.description or txn.description,
                type=txn.type,
                debit=round(debit, 2),
                credit=round(credit, 2),
            ))

    entries.sort(key=lambda e: (e.date, e.reference))
    if account_id is not None and account_code is None:
        raise ValueError("Account not found")

    balance = round(debit_total - credit_total, 2)
    return GeneralLedger(
        from_date=from_date, to_date=to_date,
        account_id=account_id, account_code=account_code, account_name=account_name,
        entries=entries, total_debits=round(debit_total, 2),
        total_credits=round(credit_total, 2), balance=balance,
    )
