import { request } from "./client";

export interface ApiTokenUserInfo {
  id: string;
  email: string;
  full_name: string;
  role: string;
  role_id: string | null;
  is_superuser: boolean;
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_slug: string | null;
  // null means "no fixed branch" — an Admin/Owner with implicit access to
  // every branch, same convention as tenant_id null for a platform superuser.
  branch_id: string | null;
  branch_name: string | null;
  permissions: string[];
}

export interface ApiTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: ApiTokenUserInfo;
}

export const authApi = {
  login: (email: string, password: string, tenant_slug?: string) =>
    request<{ data: ApiTokenResponse }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, tenant_slug }),
    }),
  refresh: (refresh_token: string) =>
    request<{ data: ApiTokenResponse }>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token }),
    }),
};
