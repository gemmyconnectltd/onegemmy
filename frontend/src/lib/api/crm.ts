import { request, qs } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";
import type { ApiCustomer, ApiDeal } from "./sales";

export type ApiCrmContact = ApiCustomer;
export type ApiCrmOpportunity = ApiDeal;

export interface ApiCrmActivity {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  deal_id: string | null;
  created_by_id: string | null;
  kind: "call" | "meeting" | "email" | "note" | "task";
  subject: string;
  description: string | null;
  status: "open" | "done" | "cancelled";
  due_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  customer: { id: string; name: string } | null;
  deal: { id: string; name: string } | null;
}

export interface CrmActivityFilters {
  customer_id?: string;
  deal_id?: string;
  status?: ApiCrmActivity["status"];
  search?: string;
}

export interface ApiCampaign {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  status: string;
  start_date: string | null;
  target_count: number;
  sent_count: number;
  opened_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface ApiEmailLog {
  id: string;
  tenant_id: string;
  campaign_id: string | null;
  recipient: string;
  subject: string;
  body: string | null;
  status: string;
  sent_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  campaign: { id: string; name: string } | null;
}

const BASE = "/tenants/crm";

export const crmApi = {
  // Contacts and opportunities use the existing sales records as their source of truth.
  listContacts: (page = 1, pageSize = 25, search?: string, customerType?: string) =>
    request<PaginatedResponse<ApiCrmContact>>(`${BASE}/contacts${qs({ page, page_size: pageSize, search, customer_type: customerType })}`),
  getContact: (id: string) =>
    request<SingleResponse<ApiCrmContact>>(`${BASE}/contacts/${encodeURIComponent(id)}`),
  createContact: (data: object) =>
    request<SingleResponse<ApiCrmContact>>(`${BASE}/contacts`, { method: "POST", body: JSON.stringify(data) }),
  updateContact: (id: string, data: object) =>
    request<SingleResponse<ApiCrmContact>>(`${BASE}/contacts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteContact: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/contacts/${encodeURIComponent(id)}`, { method: "DELETE" }),

  listOpportunities: (page = 1, pageSize = 25, stage?: string, search?: string) =>
    request<PaginatedResponse<ApiCrmOpportunity>>(`${BASE}/opportunities${qs({ page, page_size: pageSize, stage, search })}`),
  createOpportunity: (data: object) =>
    request<SingleResponse<ApiCrmOpportunity>>(`${BASE}/opportunities`, { method: "POST", body: JSON.stringify(data) }),
  updateOpportunity: (id: string, data: object) =>
    request<SingleResponse<ApiCrmOpportunity>>(`${BASE}/opportunities/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteOpportunity: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/opportunities/${encodeURIComponent(id)}`, { method: "DELETE" }),

  listActivities: (page = 1, pageSize = 25, filters: CrmActivityFilters = {}) =>
    request<PaginatedResponse<ApiCrmActivity>>(`${BASE}/activities${qs({ page, page_size: pageSize, ...filters })}`),
  createActivity: (data: object) =>
    request<SingleResponse<ApiCrmActivity>>(`${BASE}/activities`, { method: "POST", body: JSON.stringify(data) }),
  updateActivity: (id: string, data: object) =>
    request<SingleResponse<ApiCrmActivity>>(`${BASE}/activities/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteActivity: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/activities/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // Campaigns
  listCampaigns: (page = 1, pageSize = 25, search?: string, status?: string) =>
    request<PaginatedResponse<ApiCampaign>>(`${BASE}/campaigns${qs({ page, page_size: pageSize, search, status })}`),
  createCampaign: (data: object) =>
    request<SingleResponse<ApiCampaign>>(`${BASE}/campaigns`, { method: "POST", body: JSON.stringify(data) }),
  updateCampaign: (id: string, data: object) =>
    request<SingleResponse<ApiCampaign>>(`${BASE}/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteCampaign: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/campaigns/${id}`, { method: "DELETE" }),

  // Email log
  listEmails: (page = 1, pageSize = 25, search?: string, status?: string) =>
    request<PaginatedResponse<ApiEmailLog>>(`${BASE}/emails${qs({ page, page_size: pageSize, search, status })}`),
  createEmail: (data: object) =>
    request<SingleResponse<ApiEmailLog>>(`${BASE}/emails`, { method: "POST", body: JSON.stringify(data) }),
  updateEmail: (id: string, data: object) =>
    request<SingleResponse<ApiEmailLog>>(`${BASE}/emails/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteEmail: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/emails/${id}`, { method: "DELETE" }),
};
