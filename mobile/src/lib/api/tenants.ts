import { request } from "./client";
import type { SingleResponse } from "./types";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  currency: string;
  logo_url: string | null;
  brand_color: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
}

/** Pesaa's controls for the signed-in person: only features that are not plain Active are listed. */
export interface FeatureControlState {
  status: "active" | "inactive" | "coming_soon" | "beta" | "maintenance" | "deprecated";
  visible: boolean; writable: boolean; message: string | null; level: "none" | "info" | "warning" | "blocked";
  blocked_actions: string[]; upcoming?: { status: string; at: string; message: string | null } | null; write_hours?: string | null;
}

export const tenantsApi = {
  entitlements: () => request<SingleResponse<{ controls?: Record<string, FeatureControlState> }>>("/tenants/me/entitlements"),
  getCurrent: () => request<SingleResponse<Tenant>>("/tenants/me/current"),
};
