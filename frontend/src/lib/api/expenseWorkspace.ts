import { request, qs, downloadFile } from "./client";
import type { SingleResponse } from "./types";
import type { AccountingExpense } from "./accounting";
export interface ExpenseRecord extends AccountingExpense {
  branch_id: string | null; supplier_id: string | null; payment_method: string;
  reference_number: string | null; receipt_name: string | null; receipt_type: string | null;
  created_at?: string; updated_at?: string;
}
export interface ExpenseFilters { search?: string; category?: string; payment_method?: string; status?: string; from_date?: string; to_date?: string; }
export interface ExpensePage { items: ExpenseRecord[]; total: number; page: number; page_size: number; currency: string; summary?: { total: string; count: number; categories: {name: string; amount: string; count: number}[]; other_amount: string }; }
export interface ExpenseCategory { id: string; name: string; description: string | null; is_active: boolean; }
export interface CategoryPage { items: ExpenseCategory[]; total: number; page: number; page_size: number; }
export interface ExpenseDetail { record: ExpenseRecord; supplier: string | null; history: { action: string; summary: string; actor: string | null; date: string }[]; history_total: number; }
export interface ExpenseInput { title: string; amount: string; expense_date: string; category: string; notes: string | null; payment_method: string; reference_number: string | null; supplier_id: string | null; client_reference?: string; }
const base = "/tenants/expense-management";
const clean = (filters: ExpenseFilters) => Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
export const expenseWorkspaceApi = {
  list: (filters: ExpenseFilters, page: number) => request<SingleResponse<ExpensePage>>(`${base}/search?page=${page}&page_size=25`, { method: "POST", body: JSON.stringify(clean(filters)) }),
  overview: (filters: ExpenseFilters) => request<SingleResponse<ExpensePage>>(`${base}/overview`, { method: "POST", body: JSON.stringify(clean(filters)) }),
  detail: (id: string, page: number) => request<SingleResponse<ExpenseDetail>>(`${base}/${id}?history_page=${page}`),
  create: (data: ExpenseInput) => request<SingleResponse<ExpenseRecord>>(base, {method: "POST", body: JSON.stringify(data)}),
  edit: (id: string, data: ExpenseInput) => request<SingleResponse<ExpenseRecord>>(`${base}/${id}`, {method: "PATCH", body: JSON.stringify(data)}),
  action: (id: string, action: string) => request<SingleResponse<ExpenseRecord | null>>(`${base}/${id}/${action}`, {method: "POST"}),
  categories: (page: number, search: string) => request<SingleResponse<CategoryPage>>(`${base}/categories${qs({ page, search })}`),
  saveCategory: (data: Omit<ExpenseCategory, "id">, id?: string) => request<SingleResponse<ExpenseCategory>>(`${base}/categories${id ? `/${id}` : ""}`, {method: id ? "PATCH" : "POST", body: JSON.stringify(data)}),
  attach: (id: string, file: File) => { const body = new FormData(); body.append("file", file); return request<SingleResponse<{receipt_name: string}>>(`${base}/${id}/receipt`, { method: "PUT", body }); },
  receipt: (id: string, name: string) => downloadFile(`${base}/${id}/receipt`, name),
};
