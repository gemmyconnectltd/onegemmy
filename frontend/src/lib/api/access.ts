import { request } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";
import type { ModuleStatus } from "./tenants";

/** One ERP module as a person or role experiences it: what their permissions allow, and what is effective once the business's
 *  plan, Pesaa's restrictions and the business's own switch are applied. */
export interface AccessModule {
  key: string;
  name: string;
  status: ModuleStatus;
  can_view: boolean;
  can_change: boolean;
  effective_view: boolean;
  effective_change: boolean;
  /** Switched off for this one person, whatever their role allows. */
  blocked?: boolean;
}

export interface PermissionCell { id: string; name: string; label: string; granted: boolean }
export interface PermissionResource { resource: string; label: string; actions: Record<string, PermissionCell> }
export interface PermissionGroup { module: string; name: string; status: ModuleStatus | null; resources: PermissionResource[] }

export interface BranchScope { all: boolean; branches: { id: string; name: string }[] }

export interface UserAccess {
  user: { id: string; full_name: string; email: string; is_active: boolean; is_owner: boolean; role: string | null; role_id: string | null };
  branches: BranchScope;
  modules: AccessModule[];
  groups: PermissionGroup[];
}

export interface RoleAccess {
  role: { id: string; name: string; description: string | null; built_in: boolean; users: number; permissions: number };
  modules: AccessModule[];
  groups: PermissionGroup[];
}

export interface AccessRow {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  is_owner: boolean;
  role: string | null;
  role_id: string | null;
  branches: { id: string; name: string }[];
  all_branches: boolean;
  /** Keys of the modules the person can open right now. */
  modules: string[];
}

export interface AccessSummary {
  total_users: number;
  active_users: number;
  with_role: number;
  /** Active people with no role (and not the owner): a reliable "needs a look" signal. */
  without_role: number;
  roles: number;
  modules_on: number;
  modules_total: number;
}

export interface AccessFilters { page: number; search?: string; roleId?: string; branchId?: string; status?: "active" | "inactive"; assignedOnly?: boolean }

export interface RoleSummary { id: string; name: string; users: number; permissions: number; builtIn: boolean }

export interface ModuleDetail {
  key: string;
  name: string;
  status: ModuleStatus;
  resources: string[];
  owners: number;
  roles: { id: string; name: string; can_view: boolean; can_change: boolean; users: number }[];
  history: { id: string; action: string; summary: string; actor: string | null; at: string | null }[];
}

const T = "/tenants";
const qs = (o: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "") p.set(k, String(v));
  return p.toString();
};

export const accessApi = {
  summary: (f: AccessFilters) =>
    request<PaginatedResponse<AccessRow> & { data: { summary: AccessSummary } }>(`${T}/users/access-summary?${qs({ page: f.page, page_size: 20, search: f.search, role_id: f.roleId, branch_id: f.branchId, status: f.status, assigned_only: f.assignedOnly ? "true" : undefined })}`),
  user: (id: string) => request<SingleResponse<UserAccess>>(`${T}/users/${id}/access`),
  role: (id: string) => request<SingleResponse<RoleAccess>>(`${T}/roles/${id}/access`),
  roles: () => request<SingleResponse<RoleSummary[]>>(`${T}/roles/review`),
  updateRole: (id: string, data: { name?: string; description?: string | null }) =>
    request<SingleResponse<{ id: string; name: string; description: string | null }>>(`${T}/roles/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  seedDefaults: () => request<SingleResponse<{ added: string[] }>>(`${T}/roles/seed-defaults`, { method: "POST" }),
  deleteRole: (id: string) => request<SingleResponse<unknown>>(`${T}/roles/${id}`, { method: "DELETE" }),
  module: (key: string) => request<SingleResponse<ModuleDetail>>(`${T}/me/modules/${encodeURIComponent(key)}/access`),
};
