import { request, getStoredToken, API_BASE } from "./client";
import type { SingleResponse } from "./types";

/** enabled = usable; available = included in the plan but turned off by the business; not_included = the plan lacks it;
 *  restricted = Pesaa has switched it off for this business. */
export type ModuleStatus = "enabled" | "available" | "not_included" | "restricted";

export interface ModuleLink { key: string; name: string; status: ModuleStatus }

export interface TenantModule {
  key: string;
  name: string;
  description: string | null;
  status: ModuleStatus;
  /** Modules this one needs switched on. */
  needs: ModuleLink[];
  /** Modules that rely on this one. */
  needed_by: ModuleLink[];
}

export interface TenantModules {
  plan: { name: string; status: string } | null;
  modules: TenantModule[];
}

export interface TenantEntitlements {
  features: Record<string, boolean>;
  /** Why each module is or isn't usable (absent on older servers). */
  modules?: Record<string, ModuleStatus>;
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
  timezone?: string;
  currency: string;
  vat_enabled: boolean;
  multi_branch: boolean;
  /** Most NEW credit one customer can be granted per day, in the base currency. null = no limit. */
  credit_daily_limit?: number | string | null;
  /** How Pesaa should reach the business first. */
  preferred_contact?: "email" | "phone" | "whatsapp" | "all";
  business_type: string | null;
  industry: string | null;
  business_category: string | null;
  employee_count: string | null;
  business_location: string | null;
  heard_about: string | null;
  referral_code: string | null;
}

export interface TenantUpdateInput {
  name?: string;
  /** Base (accounting) currency — refused by the server once the business has recorded transactions. */
  timezone?: string;
  currency?: string;
  brand_color?: string | null;
  vat_enabled?: boolean;
  /** null clears the limit. Needs credit:approve — the server refuses anyone else. */
  credit_daily_limit?: number | null;
  preferred_contact?: "email" | "phone" | "whatsapp" | "all";
  website?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  business_type?: string | null;
  industry?: string | null;
  business_category?: string | null;
  employee_count?: string | null;
  business_location?: string | null;
  heard_about?: string | null;
  referral_code?: string | null;
}

const T = "/tenants";

export const tenantsApi = {
  entitlements: () =>
    request<SingleResponse<TenantEntitlements>>(`${T}/me/entitlements`),
  modules: () =>
    request<SingleResponse<TenantModules>>(`${T}/me/modules`),
  setModule: (key: string, enabled: boolean) =>
    request<SingleResponse<TenantModules>>(`${T}/me/modules/${key}`, { method: "PATCH", body: JSON.stringify({ enabled }) }),
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
