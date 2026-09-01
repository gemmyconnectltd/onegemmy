import { request, getStoredToken, API_BASE } from "./client";
import type { SingleResponse, PaginatedResponse } from "./types";

export interface AccountingAccount {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  type: string;
  normal_balance: string;
  description: string | null;
  is_active: boolean;
}

export interface AccountingExpense {
  id: string;
  tenant_id: string;
  reference: string;
  title: string;
  amount: number;
  expense_date: string;
  category: string;
  status: string;
  notes: string | null;
  account_id: string | null;
  account: AccountingAccount | null;
}

export interface AccountingTransactionLine {
  id: string;
  transaction_id: string;
  account_id: string;
  type: string;
  amount: number;
  description: string | null;
  account: AccountingAccount | null;
}

export interface AccountingTransaction {
  id: string;
  tenant_id: string;
  reference: string;
  type: string;
  status: string;
  transaction_date: string | null;
  description: string | null;
  order_id: string | null;
  return_id: string | null;
  lines: AccountingTransactionLine[];
}

export interface TrialBalanceLine {
  code: string;
  name: string;
  type: string;
  normal_balance: string;
  debit_total: number;
  credit_total: number;
  balance: number;
}

export interface TrialBalance {
  from_date: string | null;
  to_date: string | null;
  accounts: TrialBalanceLine[];
  total_debits: number;
  total_credits: number;
  balanced: boolean;
}

export interface StatementLine {
  code: string;
  name: string;
  amount: number;
}

export interface IncomeStatement {
  from_date: string | null;
  to_date: string | null;
  revenue_accounts: StatementLine[];
  total_revenue: number;
  cogs_accounts: StatementLine[];
  total_cogs: number;
  gross_profit: number;
  operating_expense_accounts: StatementLine[];
  total_operating_expenses: number;
  operating_income: number;
  other_income: StatementLine[];
  total_other_income: number;
  net_income: number;
  net_margin_pct: number | null;
}

export interface BalanceSheetSection {
  title: string;
  accounts: StatementLine[];
  total: number;
}

export interface BalanceSheet {
  as_of: string;
  current_assets: BalanceSheetSection;
  non_current_assets: BalanceSheetSection;
  total_assets: number;
  current_liabilities: BalanceSheetSection;
  non_current_liabilities: BalanceSheetSection;
  total_liabilities: number;
  equity_accounts: StatementLine[];
  retained_earnings: number;
  total_equity: number;
  total_liabilities_and_equity: number;
  in_balance: boolean;
  difference: number;
}

export interface CashFlowLine {
  account_code: string;
  account_name: string;
  amount: number;
}

export interface CashFlowSection {
  title: string;
  lines: CashFlowLine[];
  total: number;
}

export interface CashFlowStatement {
  from_date: string | null;
  to_date: string | null;
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  net_cash_change: number;
  beginning_cash: number;
  ending_cash: number;
}

export interface LedgerEntry {
  transaction_id: string;
  reference: string;
  date: string;
  description: string | null;
  type: string;
  debit: number;
  credit: number;
}

export interface GeneralLedger {
  from_date: string | null;
  to_date: string | null;
  account_id: string | null;
  account_code: string | null;
  account_name: string | null;
  entries: LedgerEntry[];
  total_debits: number;
  total_credits: number;
  balance: number;
}

const BASE = "/tenants/accounting";

const qs = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") search.set(k, String(v));
  });
  const s = search.toString();
  return s ? `?${s}` : "";
};

export const accountingApi = {
  trialBalance: (fromDate?: string, toDate?: string) =>
    request<SingleResponse<TrialBalance>>(`${BASE}/reports/trial-balance${qs({ from_date: fromDate, to_date: toDate })}`),
  incomeStatement: (fromDate?: string, toDate?: string) =>
    request<SingleResponse<IncomeStatement>>(`${BASE}/reports/income-statement${qs({ from_date: fromDate, to_date: toDate })}`),
  balanceSheet: (asOf?: string) =>
    request<SingleResponse<BalanceSheet>>(`${BASE}/reports/balance-sheet${qs({ as_of: asOf })}`),
  cashFlow: (fromDate?: string, toDate?: string) =>
    request<SingleResponse<CashFlowStatement>>(`${BASE}/reports/cash-flow${qs({ from_date: fromDate, to_date: toDate })}`),
  generalLedger: (fromDate?: string, toDate?: string, accountId?: string) =>
    request<SingleResponse<GeneralLedger>>(`${BASE}/reports/general-ledger${qs({ from_date: fromDate, to_date: toDate, account_id: accountId })}`),
  exportStatement: async (
    statement: "trial-balance" | "income-statement" | "balance-sheet" | "cash-flow" | "general-ledger",
    format: "csv" | "pdf",
    params: { fromDate?: string; toDate?: string; asOf?: string; accountId?: string } = {},
  ) => {
    const token = getStoredToken();
    const query = qs({
      format,
      from_date: params.fromDate,
      to_date: params.toDate,
      as_of: params.asOf,
      account_id: params.accountId,
    });
    const res = await fetch(`${API_BASE}${BASE}/reports/${statement}/export${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${statement}-${new Date().toISOString().slice(0, 10)}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  listAccounts: (type?: string) =>
    request<PaginatedResponse<AccountingAccount>>(`${BASE}/accounts${qs({ type })}`),
  createAccount: (data: { code: string; name: string; type: string; normal_balance: string; description?: string | null }) =>
    request<SingleResponse<AccountingAccount>>(`${BASE}/accounts`, { method: "POST", body: JSON.stringify(data) }),
  updateAccount: (id: string, data: Partial<Pick<AccountingAccount, "name" | "description" | "is_active">>) =>
    request<SingleResponse<AccountingAccount>>(`${BASE}/accounts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteAccount: (id: string) =>
    request<SingleResponse<unknown>>(`${BASE}/accounts/${id}`, { method: "DELETE" }),
  seedAccounts: () =>
    request<SingleResponse<unknown>>(`${BASE}/accounts/seed`, { method: "POST" }),

  listExpenses: (status?: string) =>
    request<PaginatedResponse<AccountingExpense>>(`${BASE}/expenses${qs({ status })}`),
  createExpense: (data: { title: string; amount: number; expense_date: string; category: string; notes?: string | null; account_id?: string | null }) =>
    request<SingleResponse<AccountingExpense>>(`${BASE}/expenses`, { method: "POST", body: JSON.stringify(data) }),
  approveExpense: (id: string) =>
    request<SingleResponse<AccountingExpense>>(`${BASE}/expenses/${id}/approve`, { method: "POST" }),
  rejectExpense: (id: string) =>
    request<SingleResponse<AccountingExpense>>(`${BASE}/expenses/${id}/reject`, { method: "POST" }),
  deleteExpense: (id: string) =>
    request<SingleResponse<unknown>>(`${BASE}/expenses/${id}`, { method: "DELETE" }),

  listTransactions: (type?: string, status?: string) =>
    request<PaginatedResponse<AccountingTransaction>>(`${BASE}/transactions${qs({ type, status })}`),
  createTransaction: (data: {
    type: string;
    transaction_date: string;
    description?: string | null;
    lines: { account_id: string; type: "debit" | "credit"; amount: number }[];
  }) =>
    request<SingleResponse<AccountingTransaction>>(`${BASE}/transactions`, { method: "POST", body: JSON.stringify(data) }),
  postTransaction: (id: string) =>
    request<SingleResponse<AccountingTransaction>>(`${BASE}/transactions/${id}/post`, { method: "POST" }),
  voidTransaction: (id: string) =>
    request<SingleResponse<AccountingTransaction>>(`${BASE}/transactions/${id}/void`, { method: "POST" }),
  backfillSales: () =>
    request<SingleResponse<{ created: number }>>(`${BASE}/transactions/backfill-sales`, { method: "POST" }),
};
