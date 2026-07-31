import { request } from "./client";
import type { SingleResponse } from "./types";

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
  permissions: string[];
}

export interface ApiTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: ApiTokenUserInfo;
}

export interface ApiRegisterRequest {
  tenant_name: string;
  tenant_slug: string;
  email: string;
  password: string;
  full_name: string;
}

export const authApi = {
  login: (email: string, password: string, tenant_slug?: string) =>
    request<{ data: ApiTokenResponse }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, tenant_slug }),
    }),
  register: (data: ApiRegisterRequest) =>
    request<{ data: ApiTokenResponse }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  refresh: (refresh_token: string) =>
    request<{ data: ApiTokenResponse }>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token }),
    }),
};
