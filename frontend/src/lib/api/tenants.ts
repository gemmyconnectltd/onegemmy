import { request } from "./client";
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

const T = "/tenants";

export const tenantsApi = {
  entitlements: () =>
    request<SingleResponse<TenantEntitlements>>(`${T}/me/entitlements`),
};
