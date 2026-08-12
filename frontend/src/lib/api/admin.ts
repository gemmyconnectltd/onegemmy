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

export interface AdminUserRow extends AdminUser {
  tenant_id: string | null;
  tenant_name: string | null;
}

export interface AdminDepartment {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminRole {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminBranch {
  id: string;
  tenant_id: string;
  name: string;
  location: string | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface FeatureFlag {
  key: string;
  name: string;
  module: string;
  description: string | null;
  default_enabled: boolean;
  is_active: boolean;
}

export interface TenantFeatureState {
  key: string;
  name: string;
  module: string;
  description: string | null;
  default_enabled: boolean;
  enabled: boolean;
  overridden: boolean;
}

export interface TenantLimits {
  max_users: number | null;
  max_branches: number | null;
  max_products: number | null;
  max_storage_mb: number | null;
}

const B = "/admin";

export const adminApi = {
  stats: () => request<SingleResponse<AdminPlatformStats>>(`${B}/stats`),
  listUsers: (page = 1, pageSize = 50) =>
    request<PaginatedResponse<AdminUserRow>>(`${B}/users?page=${page}&page_size=${pageSize}`),

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
  deleteUser: (tenantId: string, userId: string) =>
    request<SingleResponse<unknown>>(`${B}/tenants/${tenantId}/users/${userId}`, { method: "DELETE" }),

  tenantDepartments: (id: string, page = 1) =>
    request<PaginatedResponse<AdminDepartment>>(`${B}/tenants/${id}/departments?page=${page}&page_size=50`),
  createDepartment: (tenantId: string, data: { name: string; description?: string }) =>
    request<SingleResponse<AdminDepartment>>(`${B}/tenants/${tenantId}/departments`, { method: "POST", body: JSON.stringify(data) }),
  deleteDepartment: (tenantId: string, departmentId: string) =>
    request<SingleResponse<unknown>>(`${B}/tenants/${tenantId}/departments/${departmentId}`, { method: "DELETE" }),

  tenantRoles: (id: string, page = 1) =>
    request<PaginatedResponse<AdminRole>>(`${B}/tenants/${id}/roles?page=${page}&page_size=50`),
  createRole: (tenantId: string, data: { name: string; description?: string }) =>
    request<SingleResponse<AdminRole>>(`${B}/tenants/${tenantId}/roles`, { method: "POST", body: JSON.stringify(data) }),
  deleteRole: (tenantId: string, roleId: string) =>
    request<SingleResponse<unknown>>(`${B}/tenants/${tenantId}/roles/${roleId}`, { method: "DELETE" }),

  tenantBranches: (id: string, page = 1) =>
    request<PaginatedResponse<AdminBranch>>(`${B}/tenants/${id}/branches?page=${page}&page_size=50`),
  createBranch: (tenantId: string, data: { name: string; location?: string }) =>
    request<SingleResponse<AdminBranch>>(`${B}/tenants/${tenantId}/branches`, { method: "POST", body: JSON.stringify(data) }),
  deleteBranch: (tenantId: string, branchId: string) =>
    request<SingleResponse<unknown>>(`${B}/tenants/${tenantId}/branches/${branchId}`, { method: "DELETE" }),

  listFeatures: () =>
    request<SingleResponse<FeatureFlag[]>>(`${B}/features`),
  tenantFeatures: (tenantId: string) =>
    request<SingleResponse<TenantFeatureState[]>>(`${B}/tenants/${tenantId}/features`),
  setTenantFeatures: (tenantId: string, data: { features: Record<string, boolean> }) =>
    request<SingleResponse<TenantFeatureState[]>>(`${B}/tenants/${tenantId}/features`, { method: "PATCH", body: JSON.stringify(data) }),
  resetTenantFeatures: (tenantId: string) =>
    request<SingleResponse<TenantFeatureState[]>>(`${B}/tenants/${tenantId}/features/reset`, { method: "POST" }),
  tenantLimits: (tenantId: string) =>
    request<SingleResponse<TenantLimits>>(`${B}/tenants/${tenantId}/limits`),
  setTenantLimits: (tenantId: string, data: TenantLimits) =>
    request<SingleResponse<TenantLimits>>(`${B}/tenants/${tenantId}/limits`, { method: "PATCH", body: JSON.stringify(data) }),
  resetUserPassword: (tenantId: string, userId: string) =>
    request<SingleResponse<{ user_id: string; email: string; full_name: string; temp_password: string }>>(`${B}/tenants/${tenantId}/users/${userId}/reset-password`, { method: "POST" }),
};
