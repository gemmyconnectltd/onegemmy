import uuid
from datetime import date

from pydantic import BaseModel


class TrialBalanceLine(BaseModel):
    code: str
    name: str
    type: str
    normal_balance: str
    debit_total: float
    credit_total: float
    balance: float


class TrialBalance(BaseModel):
    from_date: date | None
    to_date: date | None
    accounts: list[TrialBalanceLine]
    total_debits: float
    total_credits: float
    balanced: bool


class StatementLine(BaseModel):
    code: str
    name: str
    amount: float


class IncomeStatement(BaseModel):
    from_date: date | None
    to_date: date | None
    revenue_accounts: list[StatementLine]
    total_revenue: float
    cogs_accounts: list[StatementLine]
    total_cogs: float
    gross_profit: float
    operating_expense_accounts: list[StatementLine]
    total_operating_expenses: float
    operating_income: float
    other_income: list[StatementLine]
    total_other_income: float
    net_income: float
    net_margin_pct: float | None


class BalanceSheetSection(BaseModel):
    title: str
    accounts: list[StatementLine]
    total: float


class BalanceSheet(BaseModel):
    as_of: date
    current_assets: BalanceSheetSection
    non_current_assets: BalanceSheetSection
    total_assets: float
    current_liabilities: BalanceSheetSection
    non_current_liabilities: BalanceSheetSection
    total_liabilities: float
    equity_accounts: list[StatementLine]
    retained_earnings: float
    total_equity: float
    total_liabilities_and_equity: float
    in_balance: bool
    difference: float


class CashFlowLine(BaseModel):
    account_code: str
    account_name: str
    amount: float


class CashFlowSection(BaseModel):
    title: str
    lines: list[CashFlowLine]
    total: float


class CashFlowStatement(BaseModel):
    from_date: date | None
    to_date: date | None
    operating: CashFlowSection
    investing: CashFlowSection
    financing: CashFlowSection
    net_cash_change: float
    beginning_cash: float
    ending_cash: float


class LedgerEntry(BaseModel):
    transaction_id: uuid.UUID
    reference: str
    date: date
    description: str | None
    type: str
    debit: float
    credit: float


class GeneralLedger(BaseModel):
    from_date: date | None
    to_date: date | None
    account_id: uuid.UUID | None
    account_code: str | None
    account_name: str | None
    entries: list[LedgerEntry]
    total_debits: float
    total_credits: float
    balance: float
