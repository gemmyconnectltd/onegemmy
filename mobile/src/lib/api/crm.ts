import { request } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";

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
}

const BASE = "/tenants/crm";

export const crmApi = {
  // Campaigns
  listCampaigns: (page = 1, pageSize = 100) =>
    request<PaginatedResponse<ApiCampaign>>(`${BASE}/campaigns?page=${page}&page_size=${pageSize}`),
  createCampaign: (data: object) =>
    request<SingleResponse<ApiCampaign>>(`${BASE}/campaigns`, { method: "POST", body: JSON.stringify(data) }),
  updateCampaign: (id: string, data: object) =>
    request<SingleResponse<ApiCampaign>>(`${BASE}/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteCampaign: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/campaigns/${id}`, { method: "DELETE" }),

  // Email log
  listEmails: (page = 1, pageSize = 100) =>
    request<PaginatedResponse<ApiEmailLog>>(`${BASE}/emails?page=${page}&page_size=${pageSize}`),
  createEmail: (data: object) =>
    request<SingleResponse<ApiEmailLog>>(`${BASE}/emails`, { method: "POST", body: JSON.stringify(data) }),
  updateEmail: (id: string, data: object) =>
    request<SingleResponse<ApiEmailLog>>(`${BASE}/emails/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteEmail: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/emails/${id}`, { method: "DELETE" }),
};
