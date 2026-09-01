import { request } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";

export interface ApiProductionItem {
  id: string;
  production_order_id: string;
  product_id: string | null;
  product_name: string | null;
  quantity_required: number;
}

export interface ApiProductionOrder {
  id: string;
  tenant_id: string;
  order_number: string;
  product_id: string | null;
  product_name: string | null;
  quantity: number;
  status: string;
  scheduled_date: string | null;
  completed_at: string | null;
  notes: string | null;
  items: ApiProductionItem[];
  created_at: string | null;
  updated_at: string | null;
}

export interface ApiBomItem {
  id: string;
  bom_id: string;
  component_product_id: string | null;
  component_product_name: string | null;
  quantity_required: number;
}

export interface ApiBom {
  id: string;
  tenant_id: string;
  name: string;
  product_id: string | null;
  product_name: string | null;
  notes: string | null;
  items: ApiBomItem[];
  created_at: string | null;
  updated_at: string | null;
}

const BASE = "/tenants/manufacturing";

export const manufacturingApi = {
  listProductionOrders: (page = 1, pageSize = 100) =>
    request<PaginatedResponse<ApiProductionOrder>>(`${BASE}/orders?page=${page}&page_size=${pageSize}`),
  createProductionOrder: (data: object) =>
    request<SingleResponse<ApiProductionOrder>>(`${BASE}/orders`, { method: "POST", body: JSON.stringify(data) }),
  getProductionOrder: (id: string) =>
    request<SingleResponse<ApiProductionOrder>>(`${BASE}/orders/${id}`),
  updateProductionOrder: (id: string, data: object) =>
    request<SingleResponse<ApiProductionOrder>>(`${BASE}/orders/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  completeProductionOrder: (id: string) =>
    request<SingleResponse<ApiProductionOrder>>(`${BASE}/orders/${id}/complete`, { method: "POST" }),
  deleteProductionOrder: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/orders/${id}`, { method: "DELETE" }),

  listBoms: (page = 1, pageSize = 100) =>
    request<PaginatedResponse<ApiBom>>(`${BASE}/boms?page=${page}&page_size=${pageSize}`),
  createBom: (data: object) =>
    request<SingleResponse<ApiBom>>(`${BASE}/boms`, { method: "POST", body: JSON.stringify(data) }),
  updateBom: (id: string, data: object) =>
    request<SingleResponse<ApiBom>>(`${BASE}/boms/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteBom: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/boms/${id}`, { method: "DELETE" }),
};
