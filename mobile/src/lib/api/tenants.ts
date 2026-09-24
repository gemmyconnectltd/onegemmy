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

export const tenantsApi = {
  getCurrent: () => request<SingleResponse<Tenant>>("/tenants/me/current"),
};
