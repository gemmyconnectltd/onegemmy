import { request } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";

export interface AdminTenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  subscription_plan: string;
  subscription_status: string;
  logo_url: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  created_at: string | null;
}

export interface AdminTenantStats {
  users: number;
  orders: number;
  completed_orders: number;
  revenue: number;
  products: number;
}

export interface AdminPlatformStats {
  total_tenants: number;
  active_tenants: number;
  suspended_tenants: number;
  total_users: number;
  total_orders: number;
  completed_orders: number;
  total_revenue: number;
  total_products: number;
  plans: Record<string, number>;
  monthly_signups: { month: string; count: number }[];
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string | null;
}

const B = "/admin";

export const adminApi = {
  stats: () => request<SingleResponse<AdminPlatformStats>>(`${B}/stats`),

  listTenants: (page = 1, pageSize = 20) =>
    request<PaginatedResponse<AdminTenant>>(`${B}/tenants?page=${page}&page_size=${pageSize}`),
  createTenant: (data: { name: string; slug: string; subscription_plan?: string; phone?: string; city?: string; country?: string }) =>
    request<SingleResponse<AdminTenant>>(`${B}/tenants`, { method: "POST", body: JSON.stringify(data) }),
  getTenant: (id: string) =>
    request<SingleResponse<AdminTenant>>(`${B}/tenants/${id}`),
  updateTenant: (id: string, data: Partial<AdminTenant>) =>
    request<SingleResponse<AdminTenant>>(`${B}/tenants/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  suspendTenant: (id: string) =>
    request<SingleResponse<AdminTenant>>(`${B}/tenants/${id}/suspend`, { method: "POST" }),
  activateTenant: (id: string) =>
    request<SingleResponse<AdminTenant>>(`${B}/tenants/${id}/activate`, { method: "POST" }),
  deleteTenant: (id: string) =>
    request<SingleResponse<unknown>>(`${B}/tenants/${id}`, { method: "DELETE" }),

  tenantStats: (id: string) =>
    request<SingleResponse<AdminTenantStats>>(`${B}/tenants/${id}/stats`),
  tenantUsers: (id: string, page = 1) =>
    request<PaginatedResponse<AdminUser>>(`${B}/tenants/${id}/users?page=${page}&page_size=50`),
  inviteUser: (tenantId: string, data: { email: string; full_name: string; role: string; password: string }) =>
    request<SingleResponse<AdminUser>>(`${B}/tenants/${tenantId}/invite`, { method: "POST", body: JSON.stringify(data) }),
};
