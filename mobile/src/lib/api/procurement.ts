import { request } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";

export interface PurchaseItem {
  id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  sku: string | null;
  variant_attributes: Record<string, string> | null;
  unit_cost: number;
  quantity: number;
  line_total: number;
}

export interface PurchaseOrder {
  id: string;
  tenant_id: string;
  reference: string;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  notes: string | null;
  expected_date: string | null;
  received_at: string | null;
  supplier_id: string | null;
  created_by: string | null;
  supplier: { id: string; name: string; email: string | null; phone: string | null } | null;
  items: PurchaseItem[];
  created_at: string | null;
  updated_at: string | null;
}

export interface PurchaseItemInput {
  product_id?: string | null;
  variant_id?: string | null;
  product_name: string;
  sku?: string | null;
  unit_cost: number;
  quantity: number;
}

export interface PurchaseCreateInput {
  supplier_id?: string | null;
  expected_date?: string | null;
  status?: string;
  discount?: number;
  tax?: number;
  notes?: string | null;
  items: PurchaseItemInput[];
}

const BASE = "/tenants/procurement/purchase-orders";

export const procurementApi = {
  listPurchaseOrders: (status?: string, page = 1, pageSize = 100) =>
    request<PaginatedResponse<PurchaseOrder>>(
      `${BASE}?page=${page}&page_size=${pageSize}${status ? `&status=${encodeURIComponent(status)}` : ""}`,
    ),
  getPurchaseOrder: (id: string) =>
    request<SingleResponse<PurchaseOrder>>(`${BASE}/${id}`),
  createPurchaseOrder: (data: PurchaseCreateInput) =>
    request<SingleResponse<PurchaseOrder>>(BASE, { method: "POST", body: JSON.stringify(data) }),
  updatePurchaseOrder: (id: string, data: object) =>
    request<SingleResponse<PurchaseOrder>>(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  receivePurchaseOrder: (id: string) =>
    request<SingleResponse<PurchaseOrder>>(`${BASE}/${id}/receive`, { method: "POST" }),
  cancelPurchaseOrder: (id: string) =>
    request<SingleResponse<PurchaseOrder>>(`${BASE}/${id}/cancel`, { method: "POST" }),
  deletePurchaseOrder: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/${id}`, { method: "DELETE" }),
};
