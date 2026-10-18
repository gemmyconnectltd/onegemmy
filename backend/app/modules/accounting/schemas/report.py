import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class TrialBalanceLine(BaseModel):
    code: str
    name: str
    type: str
    normal_balance: str
    debit_total: Decimal
    credit_total: Decimal
    balance: Decimal


class TrialBalance(BaseModel):
    from_date: date | None
    to_date: date | None
    accounts: list[TrialBalanceLine]
    total_debits: Decimal
    total_credits: Decimal
    balanced: bool


class StatementLine(BaseModel):
    code: str
    name: str
    amount: Decimal


class IncomeStatement(BaseModel):
    from_date: date | None
    to_date: date | None
    revenue_accounts: list[StatementLine]
    total_revenue: Decimal
    cogs_accounts: list[StatementLine]
    total_cogs: Decimal
    gross_profit: Decimal
    operating_expense_accounts: list[StatementLine]
    total_operating_expenses: Decimal
    operating_income: Decimal
    other_income: list[StatementLine]
    total_other_income: Decimal
    net_income: Decimal
    net_margin_pct: float | None


class BalanceSheetSection(BaseModel):
    title: str
    accounts: list[StatementLine]
    total: Decimal


class BalanceSheet(BaseModel):
    as_of: date
    current_assets: BalanceSheetSection
    non_current_assets: BalanceSheetSection
    total_assets: Decimal
    current_liabilities: BalanceSheetSection
    non_current_liabilities: BalanceSheetSection
    total_liabilities: Decimal
    equity_accounts: list[StatementLine]
    retained_earnings: Decimal
    total_equity: Decimal
    total_liabilities_and_equity: Decimal
    in_balance: bool
    difference: Decimal


class CashFlowLine(BaseModel):
    account_code: str
    account_name: str
    amount: Decimal


class CashFlowSection(BaseModel):
    title: str
    lines: list[CashFlowLine]
    total: Decimal


class CashFlowStatement(BaseModel):
    from_date: date | None
    to_date: date | None
    operating: CashFlowSection
    investing: CashFlowSection
    financing: CashFlowSection
    net_cash_change: Decimal
    beginning_cash: Decimal
    ending_cash: Decimal


class LedgerEntry(BaseModel):
    transaction_id: uuid.UUID
    reference: str
    date: date
    description: str | None
    type: str
    debit: Decimal
    credit: Decimal


class GeneralLedger(BaseModel):
    total: int = 0
    offset: int = 0
    limit: int = 100
    from_date: date | None
    to_date: date | None
    account_id: uuid.UUID | None
    account_code: str | None
    account_name: str | None
    entries: list[LedgerEntry]
    total_debits: Decimal
    total_credits: Decimal
    balance: Decimal
