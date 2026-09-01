import { request, getStoredToken, API_BASE } from "./client";
import type { SingleResponse } from "./types";

export interface TenantEntitlements {
  features: Record<string, boolean>;
  limits: {
    max_users: number | null;
    max_branches: number | null;
    max_products: number | null;
    max_storage_mb: number | null;
  };
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  logo_url: string | null;
  brand_color: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  subscription_plan: string;
  subscription_status: string;
}

export interface TenantUpdateInput {
  name?: string;
  brand_color?: string | null;
  website?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
}

const T = "/tenants";

export const tenantsApi = {
  entitlements: () =>
    request<SingleResponse<TenantEntitlements>>(`${T}/me/entitlements`),
  getCurrent: () =>
    request<SingleResponse<Tenant>>(`${T}/me/current`),
  update: (id: string, data: TenantUpdateInput) =>
    request<SingleResponse<Tenant>>(`${T}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  uploadLogo: (id: string, file: File) => {
    const token = getStoredToken();
    const form = new FormData();
    form.append("file", file);
    return fetch(`${API_BASE}${T}/${id}/logo`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then((r) => r.json()) as Promise<SingleResponse<{ logo_url: string }>>;
  },
};
