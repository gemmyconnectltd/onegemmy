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
  full_name: string;
  password: string;
  business_type?: string;
  industry?: string;
  business_category?: string;
  employee_count?: string;
  business_location?: string;
  heard_about?: string;
  referral_code?: string;
}

export interface ApiRegisterResponse {
  pending_approval: boolean;
  tenant_slug: string;
}

export const authApi = {
  login: (email: string, password: string, tenant_slug?: string) =>
    request<{ data: ApiTokenResponse }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, tenant_slug }),
    }),
  register: (data: ApiRegisterRequest) =>
    request<{ data: ApiRegisterResponse }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  refresh: (refresh_token: string) =>
    request<{ data: ApiTokenResponse }>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token }),
    }),
  forgotPassword: (email: string) =>
    request<{ data: { message: string; debug_reset_link?: string; debug_email_delivered?: boolean } }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, new_password: string) =>
    request<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password }),
    }),
  changePassword: (current_password: string, new_password: string) =>
    request<{ message: string }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    }),
};
