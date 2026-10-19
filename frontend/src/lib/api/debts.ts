import { request, qs } from "./client";
import type { SingleResponse } from "./types";
import type { DebtFilters, DebtKind, DebtRecord } from "@/lib/debts";
import type { DebtPayment } from "@/lib/debts";
import type { DebtPaymentInput } from "@/lib/debts";

export interface DebtPage {
  items: DebtRecord[]; total: number; page: number; page_size: number; currency: string;
  summary: { outstanding: string; overdue: string };
}
export interface DebtDetail {
  record: DebtRecord; payments: DebtPayment[]; payment_total: number;
  payment_page: number; payment_page_size: number;
}
export interface DebtOverview {
  currency: string; items: DebtRecord[];
  totals: Record<DebtKind, { outstanding: string; overdue: string } | null>;
}
export interface PayablePurchases { items: { id: string; reference: string; supplier: string; total: string; currency: string | null }[]; total: number; page: number; currency: string; }
const base = "/tenants/debts";
export const debtApi = {
  purchases: (page: number) => request<SingleResponse<PayablePurchases>>(`${base}/payable/purchases?page=${page}&page_size=25`),
  receive: (id: string, due_date: string) => request<SingleResponse<DebtDetail>>(`${base}/payable/purchases/${encodeURIComponent(id)}/receive`, { method: "POST", body: JSON.stringify({ due_date }) }),
  overview: () => request<SingleResponse<DebtOverview>>(`${base}/overview`),
  list: (kind: DebtKind, filters: DebtFilters) => request<SingleResponse<DebtPage>>(`${base}/${kind}/search${qs({ page: filters.page, page_size: 25 })}`, { method: "POST", body: JSON.stringify({ search: filters.search, status: filters.status === "all" ? null : filters.status, due_from: filters.due_from || null, due_to: filters.due_to || null }) }),
  detail: (kind: DebtKind, id: string, page: number) => request<SingleResponse<DebtDetail>>(`${base}/${kind}/${encodeURIComponent(id)}?payment_page=${page}`),
  pay: (kind: DebtKind, id: string, data: DebtPaymentInput) => request<SingleResponse<DebtDetail>>(`${base}/${kind}/${encodeURIComponent(id)}/payments`, { method: "POST", body: JSON.stringify(data) }),
};
