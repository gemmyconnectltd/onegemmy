import { request, qs } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";

export type ApprovalKind = "price_change" | "stock_adjustment" | "stock_transfer" | "debt_over_limit" | "sale_void";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";
export interface ApprovalRequest {
  id: string; kind: ApprovalKind; status: ApprovalStatus; title: string; reason: string | null; payload: Record<string, unknown>;
  branch_id: string | null; subject_id: string | null; requested_by: string | null; requested_by_id: string | null; requested_at: string | null;
  decided_by: string | null; decided_at: string | null; decision_note: string | null;
}
export interface ApprovalSummary { can_decide: boolean; pending: number; mine_pending: number; credit_awaiting: number }
export interface NewApproval { kind: "price_change" | "stock_adjustment"; subject_id: string; variant_id?: string | null; branch_id?: string | null; new_price?: number; new_stock?: number; reason: string }

export const KIND_LABEL: Record<ApprovalKind, string> = { price_change: "Price change", stock_adjustment: "Stock adjustment", stock_transfer: "Stock transfer", debt_over_limit: "Debt over the limit", sale_void: "Void a sale" };

export const approvalsApi = {
  list: (page = 1, filters: { status?: ApprovalStatus; kind?: string; mine?: boolean } = {}) =>
    request<PaginatedResponse<ApprovalRequest>>(`/tenants/approvals${qs({ page, page_size: 25, status: filters.status, kind: filters.kind, mine: filters.mine ? "true" : undefined })}`),
  summary: () => request<SingleResponse<ApprovalSummary>>("/tenants/approvals/summary"),
  create: (data: NewApproval) => request<SingleResponse<ApprovalRequest>>("/tenants/approvals", { method: "POST", body: JSON.stringify(data) }),
  approve: (id: string, note?: string) => request<SingleResponse<ApprovalRequest>>(`/tenants/approvals/${id}/approve`, { method: "POST", body: JSON.stringify({ note: note || null }) }),
  reject: (id: string, note: string) => request<SingleResponse<ApprovalRequest>>(`/tenants/approvals/${id}/reject`, { method: "POST", body: JSON.stringify({ note }) }),
  cancel: (id: string) => request<SingleResponse<ApprovalRequest>>(`/tenants/approvals/${id}/cancel`, { method: "POST" }),
};
