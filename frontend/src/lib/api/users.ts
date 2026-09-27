import { qs, request } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";

export interface ApiUser {
  id: string;
  tenant_id: string | null;
  /** The company this person belongs to — lets a signed-in user confirm at a
   *  glance that they're in the right portal. */
  tenant_name: string | null;
  email: string;
  full_name: string;
  phone: string | null;
  role: string;
  role_id: string | null;
  branch_id: string | null;
  department_id: string | null;
  is_active: boolean;
  is_superuser: boolean;
  last_login: string | null;
  permissions: string[];
  created_at: string | null;
  updated_at: string | null;
}

export interface ApiAuditLog {
  id: string;
  tenant_id: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  changes: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string | null;
}

export interface UserCreatePayload {
  email: string;
  full_name: string;
  phone?: string | null;
  role?: string;
  role_id?: string | null;
  branch_id?: string | null;
  department_id?: string | null;
}

export type UserUpdatePayload = Partial<
  Pick<UserCreatePayload, "full_name" | "phone" | "role" | "role_id" | "branch_id" | "department_id">
> & { is_active?: boolean };

export interface UserListFilters {
  search?: string;
  /** `undefined` = all, `true`/`false` = active only / deactivated only. */
  isActive?: boolean;
  roleId?: string;
}

export interface PasswordResetResult {
  user_id: string;
  email: string;
  full_name: string;
  emailed: boolean;
}

const U = "/tenants/users";

export const usersApi = {
  list: (page = 1, pageSize = 20, filters: UserListFilters = {}) =>
    request<PaginatedResponse<ApiUser>>(
      `${U}${qs({
        page,
        page_size: pageSize,
        search: filters.search,
        is_active: filters.isActive === undefined ? undefined : String(filters.isActive),
        role_id: filters.roleId,
      })}`,
    ),

  get: (id: string) => request<SingleResponse<ApiUser>>(`${U}/${id}`),

  /** The signed-in user's own record. Always allowed — no permission gate. */
  me: () => request<SingleResponse<ApiUser>>(`${U}/me`),

  /** Self-service. Only name and phone — role/status/email are admin-only. */
  updateMe: (data: Pick<UserUpdatePayload, "full_name" | "phone">) =>
    request<SingleResponse<ApiUser>>(`${U}/me`, { method: "PATCH", body: JSON.stringify(data) }),

  create: (data: UserCreatePayload) =>
    request<SingleResponse<ApiUser>>(`${U}`, { method: "POST", body: JSON.stringify(data) }),

  update: (id: string, data: UserUpdatePayload) =>
    request<SingleResponse<ApiUser>>(`${U}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  activate: (id: string) => request<SingleResponse<ApiUser>>(`${U}/${id}/activate`, { method: "POST" }),

  deactivate: (id: string) =>
    request<SingleResponse<ApiUser>>(`${U}/${id}/deactivate`, { method: "POST" }),

  remove: (id: string) => request<SingleResponse<unknown>>(`${U}/${id}`, { method: "DELETE" }),

  /** The admin never sees or sets the new password — the backend generates it
   *  and emails it to the user. */
  resetPassword: (id: string, sendEmail = true) =>
    request<SingleResponse<PasswordResetResult>>(`${U}/${id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ send_email: sendEmail }),
    }),

  activity: (id: string, page = 1, pageSize = 20) =>
    request<PaginatedResponse<ApiAuditLog>>(`${U}/${id}/activity${qs({ page, page_size: pageSize })}`),
};
