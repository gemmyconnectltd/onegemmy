import { request, qs, downloadFile, downloadFilePost } from "./client";
import type { SingleResponse } from "./types";
import type { DebtEditInput, DebtFilters, DebtKind, DebtRecord, DebtStatementData, DebtSummaryTotals, ManualDebtInput } from "@/lib/debts";
import type { DebtPayment } from "@/lib/debts";
import type { DebtPaymentInput } from "@/lib/debts";

export interface DebtPage {
  items: DebtRecord[]; total: number; page: number; page_size: number; currency: string;
  summary: DebtSummaryTotals;
}
export interface DebtDetail {
  record: DebtRecord; payments: DebtPayment[]; payment_total: number;
  payment_page: number; payment_page_size: number;
}
export interface DebtOverview {
  currency: string; items: DebtRecord[];
  totals: Record<DebtKind, DebtSummaryTotals | null>;
}
export interface PayablePurchases { items: { id: string; reference: string; supplier: string; total: string; currency: string | null }[]; total: number; page: number; currency: string; }
const base = "/tenants/debts";
export const debtApi = {
  purchases: (page: number) => request<SingleResponse<PayablePurchases>>(`${base}/payable/purchases?page=${page}&page_size=25`),
  receive: (id: string, due_date: string) => request<SingleResponse<DebtDetail>>(`${base}/payable/purchases/${encodeURIComponent(id)}/receive`, { method: "POST", body: JSON.stringify({ due_date }) }),
  overview: () => request<SingleResponse<DebtOverview>>(`${base}/overview`),
  list: (kind: DebtKind, filters: DebtFilters) => request<SingleResponse<DebtPage>>(`${base}/${kind}/search${qs({ page: filters.page, page_size: 25 })}`, { method: "POST", body: JSON.stringify({ search: filters.search, status: filters.status === "all" ? null : filters.status, due_from: filters.due_from || null, due_to: filters.due_to || null }) }),
  detail: (kind: DebtKind, id: string, page: number) => request<SingleResponse<DebtDetail>>(`${base}/${kind}/${encodeURIComponent(id)}?payment_page=${page}`),
  filterBody: (filters: DebtFilters) => ({ search: filters.search, status: filters.status === "all" ? null : filters.status, due_from: filters.due_from || null, due_to: filters.due_to || null }),
  edit: (kind: DebtKind, id: string, data: DebtEditInput) => request<SingleResponse<DebtDetail>>(`${base}/${kind}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }),
  writeOff: (kind: DebtKind, id: string, reason: string) => request<SingleResponse<DebtDetail>>(`${base}/${kind}/${encodeURIComponent(id)}/write-off`, { method: "POST", body: JSON.stringify({ reason }) }),
  void: (kind: DebtKind, id: string, reason: string) => request<SingleResponse<{ id: string }>>(`${base}/${kind}/${encodeURIComponent(id)}`, { method: "DELETE", body: JSON.stringify({ reason }) }),
  createManual: (kind: DebtKind, data: ManualDebtInput) => request<SingleResponse<{ id: string; reference: string }>>(`${base}/${kind}/manual`, { method: "POST", body: JSON.stringify(data) }),
  statement: (kind: DebtKind, partyId: string, from: string, to: string) => request<SingleResponse<DebtStatementData>>(`${base}/${kind}/statement${qs({ party_id: partyId, date_from: from || undefined, date_to: to || undefined })}`),
  downloadStatement: (kind: DebtKind, partyId: string, from: string, to: string, format: "pdf" | "xlsx") => downloadFile(`${base}/${kind}/statement/export${qs({ party_id: partyId, date_from: from || undefined, date_to: to || undefined, format })}`, `statement.${format}`),
  downloadList: (kind: DebtKind, filters: DebtFilters, format: "pdf" | "xlsx" | "csv", ids: string[] = []) => downloadFilePost(`${base}/${kind}/export${qs({ format })}${ids.map(id => `&ids=${encodeURIComponent(id)}`).join("")}`, debtApi.filterBody(filters), `${kind}s.${format}`),
  remind: (ids: string[], message: string) => request<SingleResponse<{ sent: number; skipped: { name: string; reason: string }[] }>>(`${base}/receivable/remind`, { method: "POST", body: JSON.stringify({ ids, message }) }),
  sendStatement: (partyId: string, from: string, to: string) => request<SingleResponse<{ sent: boolean }>>(`${base}/receivable/statement/send`, { method: "POST", body: JSON.stringify({ party_id: partyId, date_from: from || null, date_to: to || null }) }),
  pay: (kind: DebtKind, id: string, data: DebtPaymentInput) => request<SingleResponse<DebtDetail>>(`${base}/${kind}/${encodeURIComponent(id)}/payments`, { method: "POST", body: JSON.stringify(data) }),
};
