import { request, qs } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";

export type DmOperation = "archive" | "delete" | "clean_test" | "correct" | "reset";
export type DmStatus = "Prepared" | "PendingApproval" | "Approved" | "Rejected" | "Executing" | "Completed" | "PartiallyCompleted" | "Failed" | "Expired" | "Cancelled";

export const OP_LABEL: Record<DmOperation, string> = { archive: "Archive records", delete: "Delete eligible records", clean_test: "Clean test data", correct: "Correct / adjust", reset: "Close period & opening balances" };
export const OP_HINT: Record<DmOperation, string> = {
  archive: "Take records out of daily use and keep their history.", delete: "Permanently remove records nothing else depends on.", clean_test: "Remove records you have checked are test data.",
  correct: "Change a record through its own workflow, with before and after.", reset: "Lock the books through a date and record the opening position.",
};

export interface DmBusiness { id: string; name: string; slug: string; logo_url: string | null; status: string; subscription: string; timezone?: string; currency?: string }
export interface DmModuleCount { key: string; label: string; group: string; noun: string; count: number; operations: DmOperation[] }
export interface DmColumn { key: string; label: string; align: string; kind: string }
export interface DmModuleInfo {
  key: string; label: string; noun: string; note: string; columns: DmColumn[]; date_types: { key: string; label: string }[]; default_date_type: string | null;
  filters: { key: string; label: string }[]; sorts: string[]; default_sort: string; operations: Record<DmOperation, { supported: boolean; why: string }>; presets: { key: string; label: string }[];
}
export type DmFilters = Record<string, string | string[] | boolean | undefined>;
export interface DmRecord { id: string; label: string; [key: string]: unknown }
export interface DmRecordsPage { items: DmRecord[]; total: number; page: number; page_size: number; timezone: string; date_type: string | null; range: (string | null)[] }
export interface DmRecordDetail { id: string; module: string; label: string; fields: { key: string; label: string; kind: string; value: unknown }[]; related: Record<string, number>; operations: Record<DmOperation, { supported: boolean; why: string }> }
export interface DmSelection { mode: "ids" | "matching"; ids?: string[]; filters?: DmFilters; excluded_ids?: string[] }

export interface DmAssessment { id: string; label: string; eligible: boolean; reasons: string[]; related: Record<string, number>; alternative: string | null; changes: { field: string; before: unknown; after: unknown }[]; notes: string[] }
export interface DmPreview {
  closing_date: string; locked_through: string | null; currency: string; books_balanced: boolean; balances: Record<"asset" | "liability" | "equity", { code: string; name: string; balance: number }[]>;
  period_result: number; customer_receivables: number; inventory_value: number; inventory_note: string; blockers: { count: number; what: string; fix: string }[];
}
export interface DmAnalysis {
  summary: { selected: number; eligible: number; blocked: number }; assessments: DmAssessment[]; eligible_shown?: number; related: Record<string, number>; restrictions: string[];
  not_found?: string[]; preview?: DmPreview; blockers?: { count: number; what: string; fix: string }[];
}
export interface DmOperationRecord {
  id: string; reference: string; tenant_id: string; tenant_name: string; module: string; operation: DmOperation; status: DmStatus; reason: string | null; approval_required: boolean;
  requested_by: string | null; requested_by_id: string | null; decided_by: string | null; decision_note: string | null; decided_at: string | null; executed_by: string | null;
  created_at: string; submitted_at: string | null; started_at: string | null; finished_at: string | null; expires_at: string; selected: number; affected: number;
  summary: DmAnalysis["summary"]; restrictions: string[]; payload: Record<string, unknown>; result: Record<string, unknown> & { counts?: Record<string, number>; total?: number; error?: string; locked_through?: string; opening_position?: Record<string, unknown> };
  filters?: DmFilters; selection?: Record<string, unknown>; analysis?: DmAnalysis; plan_hash?: string; replayed?: boolean;
}
export interface DmItem { record_id: string; label: string; outcome: "affected" | "blocked" | "failed" | "skipped"; message: string | null; snapshot: Record<string, unknown> | null; at: string }
export interface DmRecovery {
  backups: unknown[]; backup_system: { configured: boolean; message: string }; exports: { id: string; created_at: string; format: string; categories: string[]; expires_at: string; note: string }[];
  deletion_records: { operation_id: string; reference: string; module: string; operation: string; finished_at: string; records: number; note: string }[]; recovery_available_for: Record<string, string>;
}
export interface DmSavedFilter { id: string; module: string; name: string; tenant_id: string | null; filters: DmFilters }
export interface DmHistoryFilters { tenant_id?: string; module?: string; operation?: string; status?: string; from_date?: string; to_date?: string; include_drafts?: boolean }

const B = "/admin/data-management";

export const dmApi = {
  me: () => request<SingleResponse<{ id: string; permissions: string[]; labels: Record<string, string>; all: string[] }>>(`${B}/me`),
  businesses: (page = 1, search?: string) => request<PaginatedResponse<DmBusiness>>(`${B}/businesses${qs({ page, page_size: 20, search })}`),
  business: (id: string) => request<SingleResponse<DmBusiness>>(`${B}/businesses/${id}`),
  modules: (tenantId: string) => request<SingleResponse<DmModuleCount[]>>(`${B}/businesses/${tenantId}/modules`),
  moduleInfo: (module: string) => request<SingleResponse<DmModuleInfo>>(`${B}/modules/${module}`),
  filterOptions: (tenantId: string, module: string) => request<SingleResponse<Record<string, { id: string; name: string }[]>>>(`${B}/businesses/${tenantId}/modules/${module}/filter-options`),
  records: (tenantId: string, module: string, body: { filters: DmFilters; page: number; page_size: number; sort?: string; descending: boolean }) =>
    request<SingleResponse<DmRecordsPage>>(`${B}/businesses/${tenantId}/modules/${module}/records`, { method: "POST", body: JSON.stringify(body) }),
  record: (tenantId: string, module: string, id: string) => request<SingleResponse<DmRecordDetail>>(`${B}/businesses/${tenantId}/modules/${module}/records/${id}`),
  prepare: (tenantId: string, body: { module: string; operation: DmOperation; selection?: DmSelection | null; payload?: Record<string, unknown> }) =>
    request<SingleResponse<DmOperationRecord>>(`${B}/businesses/${tenantId}/operations`, { method: "POST", body: JSON.stringify(body) }),
  operation: (id: string) => request<SingleResponse<DmOperationRecord>>(`${B}/operations/${id}`),
  items: (id: string, page = 1, outcome?: string) => request<PaginatedResponse<DmItem>>(`${B}/operations/${id}/items${qs({ page, page_size: 50, outcome })}`),
  submit: (id: string, reason: string, attest_test_data = false) => request<SingleResponse<DmOperationRecord>>(`${B}/operations/${id}/submit`, { method: "POST", body: JSON.stringify({ reason, attest_test_data }) }),
  decide: (id: string, approve: boolean, note?: string) => request<SingleResponse<DmOperationRecord>>(`${B}/operations/${id}/decision`, { method: "POST", body: JSON.stringify({ approve, note: note ?? null }) }),
  execute: (id: string, idempotency_key: string, confirm?: { business_name: string; reference: string }) =>
    request<SingleResponse<DmOperationRecord>>(`${B}/operations/${id}/execute`, { method: "POST", body: JSON.stringify({ idempotency_key, confirm: confirm ?? null }) }),
  cancel: (id: string) => request<SingleResponse<DmOperationRecord>>(`${B}/operations/${id}/cancel`, { method: "POST" }),
  history: (page = 1, f: DmHistoryFilters = {}) => request<PaginatedResponse<DmOperationRecord>>(`${B}/operations${qs({ page, page_size: 25, ...f, include_drafts: f.include_drafts ? "true" : undefined })}`),
  recovery: (tenantId: string) => request<SingleResponse<DmRecovery>>(`${B}/businesses/${tenantId}/recovery`),
  savedFilters: (module?: string) => request<SingleResponse<DmSavedFilter[]>>(`${B}/saved-filters${qs({ module })}`),
  saveFilter: (body: { module: string; name: string; tenant_id?: string; filters: DmFilters }) => request<SingleResponse<{ id: string }>>(`${B}/saved-filters`, { method: "POST", body: JSON.stringify(body) }),
  deleteFilter: (id: string) => request<SingleResponse<null>>(`${B}/saved-filters/${id}`, { method: "DELETE" }),
};
