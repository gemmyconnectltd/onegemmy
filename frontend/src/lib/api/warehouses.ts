import { request, qs } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";

export interface Warehouse {
  id: string; code: string; name: string; branch_id: string | null; branch_name: string | null; manager_id: string | null; manager_name: string | null;
  address: string | null; description: string | null; is_active: boolean; is_default: boolean; units_on_hand: number; products: number;
}
export interface WarehouseList { enabled: boolean; items: Warehouse[] }
export interface WarehouseInput { code?: string | null; name: string; branch_id?: string | null; manager_id?: string | null; address?: string | null; description?: string | null }
export interface StockRow {
  warehouse_id: string; warehouse: string; warehouse_code: string; branch_id: string | null; product_id: string; variant_id: string | null; name: string; sku: string | null;
  unit: string | null; on_hand: number; reserved: number; available: number; minimum: number; status: "ok" | "low" | "out"; last_movement: string | null;
}
export interface StockMovementRow {
  id: string; created_at: string; warehouse_id: string; warehouse: string | null; product_id: string; variant_id: string | null; product: string | null; quantity: number;
  direction: "in" | "out"; movement_type: string; reference_type: string | null; reference_number: string | null; note: string | null; user: string | null; status: string;
}
export interface StockCountLineRead { id: string; product_id: string; variant_id: string | null; product_name: string; expected: number; counted: number; difference: number }
export interface StockCountRead {
  id: string; count_number: string; warehouse_id: string; warehouse: string | null; status: "Submitted" | "Approved" | "Rejected"; note: string | null; counted_by: string | null;
  decided_by: string | null; decided_at: string | null; decision_note: string | null; created_at: string; lines: StockCountLineRead[]; variance_lines: number;
}
export interface MovementFilters { warehouse_id?: string; product_id?: string; movement_type?: string; from_date?: string; to_date?: string }

export const MOVEMENT_LABEL: Record<string, string> = {
  opening: "Opening balance", receipt: "Goods received", sale: "Sale", customer_return: "Customer return", supplier_return: "Supplier return", transfer_out: "Transfer out",
  transfer_in: "Transfer in", adjustment: "Adjustment", count: "Stock count", damage: "Damaged", production: "Production",
};

const B = "/tenants/inventory";

export const warehousesApi = {
  list: () => request<SingleResponse<WarehouseList>>(`${B}/warehouses`),
  setup: () => request<SingleResponse<WarehouseList>>(`${B}/warehouses/setup`, { method: "POST" }),
  create: (data: WarehouseInput) => request<SingleResponse<Warehouse>>(`${B}/warehouses`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<WarehouseInput>) => request<SingleResponse<Warehouse>>(`${B}/warehouses/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  action: (id: string, action: "activate" | "deactivate" | "make-default") => request<SingleResponse<Warehouse>>(`${B}/warehouses/${id}/${action}`, { method: "POST" }),
  receive: (id: string, data: { lines: { product_id: string; variant_id?: string | null; quantity: number }[]; reference?: string | null; note?: string | null }) =>
    request<SingleResponse<{ received: number; warehouse: string }>>(`${B}/warehouses/${id}/receive`, { method: "POST", body: JSON.stringify(data) }),
  stock: (page = 1, f: { warehouse_id?: string; search?: string; status?: string } = {}, pageSize = 25) =>
    request<PaginatedResponse<StockRow>>(`${B}/stock-by-warehouse${qs({ page, page_size: pageSize, ...f })}`),
  movements: (page = 1, f: MovementFilters = {}, pageSize = 25) => request<PaginatedResponse<StockMovementRow>>(`${B}/stock-movements${qs({ page, page_size: pageSize, ...f })}`),
  counts: (page = 1, status?: string) => request<PaginatedResponse<StockCountRead>>(`${B}/stock-counts${qs({ page, page_size: 25, status })}`),
  submitCount: (data: { warehouse_id: string; lines: { product_id: string; variant_id?: string | null; counted_quantity: number }[]; note?: string | null }) =>
    request<SingleResponse<StockCountRead>>(`${B}/stock-counts`, { method: "POST", body: JSON.stringify(data) }),
  decideCount: (id: string, approve: boolean, note?: string) =>
    request<SingleResponse<StockCountRead>>(`${B}/stock-counts/${id}/${approve ? "approve" : "reject"}`, { method: "POST", body: JSON.stringify({ note: note ?? null }) }),
};
