import { request, qs, downloadFile } from "./client";
import type { SingleResponse } from "./types";
import type { AccountingExpense } from "./accounting";
export interface ExpenseRecord extends AccountingExpense {
  branch_id: string | null; supplier_id: string | null; payment_method: string;
  reference_number: string | null; receipt_name: string | null; receipt_type: string | null;
  reversal_reason?: string | null; reversed_at?: string | null;
  on_credit?: boolean; paid_at?: string | null; refunded_amount?: string | number;
  created_at?: string; updated_at?: string;
}
export interface ExpenseFilters { search?: string; category?: string; payment_method?: string; status?: string; from_date?: string; to_date?: string; }
export interface ExpensePage { items: ExpenseRecord[]; total: number; page: number; page_size: number; currency: string; summary?: { total: string; count: number; categories: {name: string; amount: string; count: number}[]; other_amount: string }; }
export interface ExpenseCategory { id: string; name: string; description: string | null; is_active: boolean; account_id?: string | null; account_name?: string | null; }
export interface CategoryPage { items: ExpenseCategory[]; total: number; page: number; page_size: number; }
export interface ExpenseDetail { record: ExpenseRecord; supplier: string | null; history: { action: string; summary: string; actor: string | null; date: string }[]; history_total: number; }
export interface ExpenseInput { title: string; amount: string; expense_date: string; category: string; notes: string | null; payment_method: string; reference_number: string | null; supplier_id: string | null; client_reference?: string; on_credit?: boolean; allow_duplicate?: boolean; }
export interface RecurringExpense { id: string; title: string; amount: string; category: string; frequency: "weekly" | "monthly"; next_date: string; is_active: boolean; on_credit: boolean; payment_method: string; }
const base = "/tenants/expense-management";
const clean = (filters: ExpenseFilters) => Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
export const expenseWorkspaceApi = {
  list: (filters: ExpenseFilters, page: number, pageSize = 25) => request<SingleResponse<ExpensePage>>(`${base}/search?page=${page}&page_size=${pageSize}`, { method: "POST", body: JSON.stringify(clean(filters)) }),
  overview: (filters: ExpenseFilters) => request<SingleResponse<ExpensePage>>(`${base}/overview`, { method: "POST", body: JSON.stringify(clean(filters)) }),
  detail: (id: string, page: number) => request<SingleResponse<ExpenseDetail>>(`${base}/${id}?history_page=${page}`),
  create: (data: ExpenseInput) => request<SingleResponse<ExpenseRecord>>(base, {method: "POST", body: JSON.stringify(data)}),
  edit: (id: string, data: ExpenseInput) => request<SingleResponse<ExpenseRecord>>(`${base}/${id}`, {method: "PATCH", body: JSON.stringify(data)}),
  action: (id: string, action: string) => request<SingleResponse<ExpenseRecord | null>>(`${base}/${id}/${action}`, {method: "POST"}),
  reclassify: (id: string, account_id: string, reason: string) => request<SingleResponse<ExpenseRecord>>(`${base}/${id}/reclassify`, {method: "POST", body: JSON.stringify({ account_id, reason })}),
  pay: (id: string, payment_method: string) => request<SingleResponse<ExpenseRecord>>(`${base}/${id}/pay`, {method: "POST", body: JSON.stringify({ payment_method })}),
  refund: (id: string, data: { amount: string; method: string; reason: string }) => request<SingleResponse<ExpenseRecord>>(`${base}/${id}/refund`, {method: "POST", body: JSON.stringify(data)}),
  settings: () => request<SingleResponse<{ auto_approve_below: string | null }>>(`${base}/settings`),
  saveSettings: (auto_approve_below: string | null) => request<SingleResponse<{ auto_approve_below: string | null }>>(`${base}/settings`, {method: "PATCH", body: JSON.stringify({ auto_approve_below })}),
  recurring: () => request<SingleResponse<RecurringExpense[]>>(`${base}/recurring`),
  createRecurring: (data: object) => request<SingleResponse<RecurringExpense>>(`${base}/recurring`, {method: "POST", body: JSON.stringify(data)}),
  toggleRecurring: (id: string) => request<SingleResponse<{ id: string; is_active: boolean }>>(`${base}/recurring/${id}/toggle`, {method: "POST"}),
  runRecurring: () => request<SingleResponse<{ created: number }>>(`${base}/recurring/run`, {method: "POST"}),
  reverse: (id: string, reason: string) => request<SingleResponse<ExpenseRecord>>(`${base}/${id}/reverse`, {method: "POST", body: JSON.stringify({ reason })}),
  categories: (page: number, search: string) => request<SingleResponse<CategoryPage>>(`${base}/categories${qs({ page, search })}`),
  saveCategory: (data: Omit<ExpenseCategory, "id" | "account_name">, id?: string) => request<SingleResponse<ExpenseCategory>>(`${base}/categories${id ? `/${id}` : ""}`, {method: id ? "PATCH" : "POST", body: JSON.stringify(data)}),
  attach: (id: string, file: File) => { const body = new FormData(); body.append("file", file); return request<SingleResponse<{receipt_name: string}>>(`${base}/${id}/receipt`, { method: "PUT", body }); },
  receipt: (id: string, name: string) => downloadFile(`${base}/${id}/receipt`, name),
};
