import { downloadFile, request, qs } from "./client";
import type { ApiProduct } from "./inventory";
import type { SingleResponse } from "./types";

export interface ProductActivity {
  id: string; type: string; category: string; occurred_at: string;
  reference: string | null; source_id: string | null; source: string;
  branch_id: string | null; other_branch_id: string | null; actor_id: string | null;
  branch: string | null; other_branch: string | null; actor: string | null;
  quantity: number | null; quantity_change: number | null; status: string | null;
  details: Record<string, unknown> & { changes?: {before?: Record<string, unknown>; after?: Record<string, unknown>; reason?: string; notes?: string} };
}
export interface ProductHistoryFilters {
  category?: string; kind?: string; search?: string; from_date?: string; to_date?: string;
  branch_id?: string; actor_id?: string;
}
export interface ProductHistoryPage {items: ProductActivity[]; total: number; counts: Record<string, number>; page: number; page_size: number}
export interface ProductDetails {
  product: ApiProduct & {created_at: string | null; updated_at: string | null; sale_by_weight: boolean};
  current_stock: number | null; stock_scope: string; total_sold: number | null;
  modules: string[]; limitations: string[];
}
export const productHistoryApi = {
  export: (id: string, filters: ProductHistoryFilters) => downloadFile(`/tenants/inventory/products/${id}/history${qs({...filters, export_csv: "true"})}`, `product-history-${id}.csv`),
  details: (id: string) => request<SingleResponse<ProductDetails>>(`/tenants/inventory/products/${id}/details`),
  history: (id: string, page: number, filters: ProductHistoryFilters, size = 20) =>
    request<SingleResponse<ProductHistoryPage>>(`/tenants/inventory/products/${id}/history${qs({page, page_size: size, ...filters})}`),
};
