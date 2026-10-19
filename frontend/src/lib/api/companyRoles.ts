import { request } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";
export interface CompanyRole { id: string; name: string; description: string | null; }
export interface Permission { id: string; name: string; resource: string; action: string; }
export const companyRolesApi = {
  list: (page: number) => request<PaginatedResponse<CompanyRole>>(`/tenants/roles?page=${page}&page_size=25`),
  permissions: (id: string) => request<SingleResponse<Permission[]>>(`/tenants/roles/${id}/permissions`),
  catalog: (page: number) => request<PaginatedResponse<Permission>>(`/global/permissions?page=${page}&page_size=100`),
  create: (name: string) => request<SingleResponse<CompanyRole>>("/tenants/roles", { method: "POST", body: JSON.stringify({ name }) }),
  assign: (id: string, permission_ids: string[]) => request<SingleResponse<null>>(`/tenants/roles/${id}/permissions`, { method: "POST", body: JSON.stringify({ permission_ids }) }),
};
