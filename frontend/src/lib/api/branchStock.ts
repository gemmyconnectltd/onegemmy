import { request, qs } from "./client";
import type { ApiProduct } from "./inventory";
import type { PaginatedResponse, SingleResponse } from "./types";

/** Stock by branch: one catalogue for the business, every branch keeps its own stock in its own warehouse.
 *  A branch only shows its own stock; "All branches" shows the business total and a row per branch. */

export type BranchStockStatus = "ok" | "low" | "out" | "none" | "not_sold";

export interface BranchStockRow {
  /** null = the "Shared warehouses" row (warehouses no branch owns). */
  branch_id: string | null; name: string; shared: boolean; warehouses: string[];
  value_cost: number; value_retail: number; units: number; products: number; low: number; out: number;
  incoming_transfers: string[]; incoming_units: number;
}
export interface BranchStockTotals {
  value_cost: number; value_retail: number; units: number; incoming_units: number; low: number; out: number; products: number; catalogue: number;
}
export interface BranchStockSummary {
  items: BranchStockRow[]; total: number; page: number; page_size: number;
  summary: { uses_warehouses: boolean; totals: BranchStockTotals | null; branch_count?: number };
}
export type BranchSort = "name" | "value" | "units" | "low" | "out" | "incoming";

export interface ProductBranchCell { branch_id: string | null; quantity: number | null; status: BranchStockStatus; reorder_level?: number }
export interface ProductWithBranches extends ApiProduct {
  branch_stock?: ProductBranchCell[] | null; held_in?: number | null; out_in?: string[] | null; low_in_any?: boolean | null;
}
export interface BranchColumns { branches: { id: string | null; name: string }[]; branch_count: number }
export type ProductsPerBranch = PaginatedResponse<ProductWithBranches>["data"] & { summary?: { branches: BranchColumns | null } };

export interface ProductBranchStock {
  branch_id: string | null; name: string; shared: boolean; warehouses: { id: string; name: string }[];
  on_hand: number; reorder_level: number; own_reorder_level: boolean; status: "ok" | "low" | "out";
  value_cost: number; value_retail: number | null; in_transit: number; last_movement: string | null; is_sold: boolean; editable: boolean;
}
export interface ProductStockByBranch {
  uses_warehouses: boolean; product_id: string; name?: string; default_reorder_level?: number; items: ProductBranchStock[]; total_on_hand: number;
}
export interface NeedsStockRow {
  product_id: string; variant_id: string | null; name: string; sku: string | null; branch_id: string; branch: string;
  on_hand: number; reorder_level: number; status: "low" | "out"; suggested: number; sources: { branch_id: string; name: string; quantity: number }[];
}
export interface NeedsStock { uses_warehouses: boolean; items: NeedsStockRow[]; total: number }
export interface BranchStockSettingsInput { reorder_level?: number | null; use_product_reorder_level?: boolean; is_sold?: boolean | null }

const B = "/tenants/inventory";

export const branchStockApi = {
  summary: (page = 1, sort: BranchSort = "name", descending = false, pageSize = 50) =>
    request<{ success: boolean; data: BranchStockSummary }>(`${B}/branches/summary${qs({ page, page_size: pageSize, sort, descending: descending ? "true" : undefined })}`),
  products: (page = 1, pageSize = 25, search?: string) =>
    request<{ success: boolean; data: ProductsPerBranch }>(`${B}/products${qs({ page, page_size: pageSize, search, is_active: "true", per_branch: "true" })}`),
  needsStock: (limit = 50) => request<SingleResponse<NeedsStock>>(`${B}/branches/needs-stock${qs({ limit })}`),
  product: (id: string) => request<SingleResponse<ProductStockByBranch>>(`${B}/products/${id}/stock-by-branch`),
  setProductBranch: (id: string, branchId: string, data: BranchStockSettingsInput) =>
    request<SingleResponse<ProductStockByBranch>>(`${B}/products/${id}/stock-by-branch/${branchId}`, { method: "PUT", body: JSON.stringify(data) }),
};

/** How a branch picker looks for this many branches (the person's own, not the business's): hidden with one, a short
 *  list up to five, a searchable list from six. */
export function pickerKind(branchCount: number): "hidden" | "select" | "search" {
  if (branchCount <= 1) return "hidden";
  return branchCount <= 5 ? "select" : "search";
}

/** Up to five branches fit as columns in the products table; more become a total, "N of M branches" and an expandable row. */
export const MAX_BRANCH_COLUMNS = 5;

/** The products that need stock in a branch first (out before low), then by name. */
export function byUrgency<T extends { status: string; name: string }>(rows: T[]): T[] {
  const rank = (s: string) => (s === "out" ? 0 : s === "low" ? 1 : 2);
  return [...rows].sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name));
}

/** Where to ask for a product a branch is short of: the other branch holding the most of it. */
export function bestSource(cells: ProductBranchCell[], names: Map<string | null, string>, exclude: string | null): { id: string; name: string; quantity: number } | null {
  let best: { id: string; name: string; quantity: number } | null = null;
  for (const c of cells) {
    if (c.branch_id === null || c.branch_id === exclude || !c.quantity || c.quantity <= 0) continue;
    if (!best || c.quantity > best.quantity) best = { id: c.branch_id, name: names.get(c.branch_id) ?? "another branch", quantity: c.quantity };
  }
  return best;
}
