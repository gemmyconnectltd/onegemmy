import { request, downloadFile } from "./client";
import type { SingleResponse } from "./types";
import type { AccountingAccount, AccountingTransaction } from "./accounting";

export type ReportKind = "income-statement" | "balance-sheet" | "cash-flow" | "equity" | "trial-balance" | "receivables-aging" | "payables-aging" | "inventory" | "general-ledger";
export type ExportFormat = "pdf" | "xlsx" | "csv";
export type Money = string | number;
export type FinancialRow = Record<string, string | number | boolean | null>;
export interface ReportInput { kind: ReportKind; from_date?: string; to_date?: string; as_of?: string; branch_id?: string; account_id?: string; search?: string; cash_only?: boolean }
export interface FinancialReport {
  id: string; kind: ReportKind; title: string; business: string; currency: string; branch: string; branch_id: string | null;
  from_date: string; to_date: string; as_of: string; generated_at: string;
  columns: { key: string; label: string; kind: "text" | "money" | "number" | "date" }[];
  rows: FinancialRow[]; totals: Record<string, Money>; row_count: number; total: number; page: number; page_size: number;
  notes: string[]; reconciliation?: { balanced: boolean; difference: Money; label: string };
}
export interface DomainPage { negative_accounts?: FinancialRow[]; negative_count?: number; items: FinancialRow[]; total: number; page: number; page_size: number; totals: Record<string, Money> }
export type DomainKind = "cash" | "reconciliations" | "assets" | "payroll" | "tax" | "tax-payments" | "pending";
export interface FinancialOverview { from_date: string; to_date: string; currency: string; revenue: Money; expenses: Money; net_profit: Money; cash_balance: Money; trend: { month: string; income: Money; expenses: Money; cash_change: Money }[]; journals: FinancialRow[] }
export interface AccountPage { items: AccountingAccount[]; total: number; page: number; page_size: number }
export interface AccountInput { code: string; name: string; type: string; normal_balance: string; description?: string | null; group_name?: string | null; parent_id?: string | null; is_active?: boolean }
const base = "/tenants/accounting/workspace";
function query(values: Record<string, string | number | boolean | undefined>) { const q = new URLSearchParams(); Object.entries(values).forEach(([k, v]) => { if (v !== undefined && v !== "") q.set(k, String(v)); }); return q.size ? `?${q}` : ""; }
const post = <T>(path: string, data: object) => request<SingleResponse<T>>(base + path, { method: "POST", body: JSON.stringify(data) });
export const financialApi = {
  createIncome: (data: object) => post<AccountingTransaction>("/income", data),
  income: (page: number, from?: string, to?: string, status?: string) => request<SingleResponse<DomainPage & { from_date: string; to_date: string; currency: string }>>(`${base}/income${query({ page, page_size: 25, from_date: from, to_date: to, status })}`),
  cashPosition: (id: string) => request<SingleResponse<FinancialRow>>(`${base}/cash-position/${id}`),
  overview: () => request<SingleResponse<FinancialOverview>>(base + "/overview"),
  preferences: () => request<SingleResponse<{ fiscal_start_month: number; inventory_method: string; ledger_currency: string }>>(base + "/preferences"),
  savePreferences: (month: number) => request<SingleResponse<object>>(base + "/preferences", { method: "PATCH", body: JSON.stringify({ fiscal_start_month: month }) }),
  generate: (input: ReportInput) => post<FinancialReport>("/reports", input),
  report: (id: string, page = 1) => request<SingleResponse<FinancialReport>>(`${base}/reports/${id}${query({ page, page_size: 50 })}`),
  export: (id: string, format: ExportFormat) => downloadFile(`${base}/reports/${id}/export?format=${format}`, `financial-report.${format}`),
  records: (view: DomainKind, page = 1, period?: string) => request<SingleResponse<DomainPage>>(`${base}/records/${view}${query({ page, page_size: 25, period })}`),
  accounts: (page = 1, search = "", type?: string, active?: boolean, cashOnly = false) => request<SingleResponse<AccountPage>>(`${base}/accounts${query({ page, page_size: 25, search, type, active, cash_only: cashOnly || undefined })}`),
  importAccounts: (items: AccountInput[]) => post<{ created: number }>("/accounts/import", { items }),
  exportAccounts: () => post<FinancialReport>("/accounts/export", {}),
  transfer: (data: Record<string, unknown>) => post<{ id: string; reference: string }>("/transfers", data),
  reconcile: (data: Record<string, unknown>) => post<{ id: string; ledger_balance: Money; difference: Money }>("/reconciliations", data),
  registerAsset: (data: Record<string, unknown>) => post<{ id: string }>("/assets", data),
  assetAction: (id: string, data: Record<string, unknown>) => post<{ id: string }>(`/assets/${id}/actions`, data),
  postPayroll: (id: string, cashId: string) => post<{ id: string }>(`/payroll/${id}/post`, { cash_account_id: cashId }),
  billTerms: (id: string, dueDate: string | null) => request<SingleResponse<object>>(`${base}/payables/${id}/terms`, { method: "PATCH", body: JSON.stringify({ due_date: dueDate }) }),
  taxPayment: (data: object) => post<object>("/tax-payments", data),
  journal: (id: string) => request<SingleResponse<AccountingTransaction>>(`${base}/journals/${id}`),
};
export interface SupplierBill { id: string; reference: string; supplier_name: string | null; bill_date: string; amount: Money; amount_paid: Money; balance: Money; status: string; currency_code: string | null; po_reference: string | null }
export const sourceApi = {
  invoice: (id: string) => request<SingleResponse<import("./sales").ApiOrder>>(`${base}/documents/receivable/${id}`),
  bill: (id: string) => request<SingleResponse<SupplierBill>>(`${base}/documents/payable/${id}`),
  payBill: (id: string, data: object) => request<SingleResponse<SupplierBill>>(`${base}/documents/payable/${id}/payments`, { method: "POST", body: JSON.stringify(data) }),
};
