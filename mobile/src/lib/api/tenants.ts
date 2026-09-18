import { request } from "./client";
import type { SingleResponse } from "./types";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  currency: string;
}

export const tenantsApi = {
  getCurrent: () => request<SingleResponse<Tenant>>("/tenants/me/current"),
};
