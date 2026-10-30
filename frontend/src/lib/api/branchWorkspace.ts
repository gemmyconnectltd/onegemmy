import { request } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";

/** One row of the branch directory: the branch's own fields plus real numbers for the chosen period. */
export interface BranchRow {
  id: string;
  name: string;
  location: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;
  is_main: boolean;
  created_at: string | null;
  /** People explicitly assigned to this branch. People with no branch limit work in every branch and are counted separately. */
  staff: number;
  active_staff: number;
  /** null when the viewer may not see sales (no permission, or the sales module is off). */
  sales: number | null;
  orders: number | null;
}

export interface BranchSummary {
  total: number;
  active: number;
  inactive: number;
  /** Different active people assigned to at least one branch. */
  assigned_staff: number;
  works_in_all_branches: number;
  sales: number | null;
  orders: number | null;
  currency: string;
  from_date: string;
  to_date: string;
}

export interface BranchFilters {
  page: number;
  search?: string;
  status?: "active" | "inactive";
  sort?: "name" | "created" | "sales" | "staff";
  dir?: "asc" | "desc";
  from?: string;
  to?: string;
  /** Only this branch (used by a branch's own page). */
  branchId?: string;
}

export interface BranchSales {
  currency: string;
  timezone: string;
  from_date: string;
  to_date: string;
  previous: { from_date: string; to_date: string; sales: number; orders: number };
  sales: number;
  orders: number;
  average: number;
  /** Change against the period before it; null when that period had no sales to compare with. */
  growth_pct: number | null;
  trend: { day: string; sales: number; orders: number }[];
  top_products: { name: string; quantity: number; amount: number }[];
  payment_methods: { method: string; amount: number }[];
  recent_orders: { id: string; number: string; total: number; at: string | null; method: string | null }[];
  definitions: string;
}

export interface BranchEvent { id: string; action: string; summary: string; actor: string | null; changes: Record<string, unknown> | null; at: string | null }

const B = "/tenants/branches";
const qs = (o: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "") p.set(k, String(v));
  return p.toString();
};

export const branchWorkspaceApi = {
  overview: (f: BranchFilters) =>
    request<PaginatedResponse<BranchRow> & { data: { summary: BranchSummary } }>(`${B}/overview?${qs({ page: f.page, page_size: 20, search: f.search, status: f.status, sort: f.sort, dir: f.dir, from_date: f.from, to_date: f.to, branch_id: f.branchId })}`),
  sales: (id: string, from?: string, to?: string) => request<SingleResponse<BranchSales>>(`${B}/${id}/sales?${qs({ from_date: from, to_date: to })}`),
  activity: (id: string) => request<SingleResponse<BranchEvent[]>>(`${B}/${id}/activity`),
};
