import { request } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";

export interface DataRemovalModule {
  key: string;
  label: string;
  date_types: { key: string; label: string }[];
  default_date_type: string;
}

export interface DataRemovalRequest {
  id: string;
  module: string;
  filters: { date_type: string; preset: string; from: string; to: string };
  reason: string;
  status: string;
  requested_by: string | null;
  created_at: string;
  review_note: string | null;
  operation_id: string | null;
  operation_reference: string | null;
}

export const dataManagementRequestsApi = {
  modules: () => request<SingleResponse<DataRemovalModule[]>>("/tenants/data-management-requests/modules"),
  list: (page = 1) => request<PaginatedResponse<DataRemovalRequest>>(`/tenants/data-management-requests?page=${page}&page_size=20`),
  create: (data: { module: string; date_type: string; from_date: string; to_date: string; reason: string }) =>
    request<SingleResponse<DataRemovalRequest>>("/tenants/data-management-requests", { method: "POST", body: JSON.stringify(data) }),
};
