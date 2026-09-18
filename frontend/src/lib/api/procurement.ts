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

export interface Requisition {
  id: string;
  tenant_id: string;
  reference: string;
  item_name: string;
  quantity: number;
  status: string;
  notes: string | null;
  department_id: string | null;
  requested_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  department_name: string | null;
  requested_by_name: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface RequisitionCreateInput {
  item_name: string;
  quantity: number;
  department_id?: string | null;
  notes?: string | null;
}

export interface PurchaseReturn {
  id: string;
  tenant_id: string;
  reference: string;
  purchase_order_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  quantity: number;
  amount: number;
  reason: string | null;
  status: string;
  return_date: string;
  processed_by: string | null;
  po_reference: string | null;
  supplier_name: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface PurchaseReturnCreateInput {
  purchase_order_id: string;
  product_id?: string | null;
  variant_id?: string | null;
  product_name: string;
  quantity: number;
  amount?: number;
  reason?: string | null;
  return_date?: string | null;
}

const BASE = "/tenants/procurement/purchase-orders";
const REQ_BASE = "/tenants/procurement/requisitions";
const RETURN_BASE = "/tenants/procurement/purchase-returns";

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

  // Requisitions
  listRequisitions: (status?: string, page = 1, pageSize = 100) =>
    request<PaginatedResponse<Requisition>>(
      `${REQ_BASE}?page=${page}&page_size=${pageSize}${status ? `&status=${encodeURIComponent(status)}` : ""}`,
    ),
  createRequisition: (data: RequisitionCreateInput) =>
    request<SingleResponse<Requisition>>(REQ_BASE, { method: "POST", body: JSON.stringify(data) }),
  approveRequisition: (id: string) =>
    request<SingleResponse<Requisition>>(`${REQ_BASE}/${id}/approve`, { method: "POST" }),
  rejectRequisition: (id: string) =>
    request<SingleResponse<Requisition>>(`${REQ_BASE}/${id}/reject`, { method: "POST" }),
  deleteRequisition: (id: string) =>
    request<SingleResponse<null>>(`${REQ_BASE}/${id}`, { method: "DELETE" }),

  // Purchase Returns
  listPurchaseReturns: (page = 1, pageSize = 100) =>
    request<PaginatedResponse<PurchaseReturn>>(`${RETURN_BASE}?page=${page}&page_size=${pageSize}`),
  createPurchaseReturn: (data: PurchaseReturnCreateInput) =>
    request<SingleResponse<PurchaseReturn>>(RETURN_BASE, { method: "POST", body: JSON.stringify(data) }),
  refundPurchaseReturn: (id: string) =>
    request<SingleResponse<PurchaseReturn>>(`${RETURN_BASE}/${id}/refund`, { method: "POST" }),
  replacePurchaseReturn: (id: string) =>
    request<SingleResponse<PurchaseReturn>>(`${RETURN_BASE}/${id}/replace`, { method: "POST" }),
  deletePurchaseReturn: (id: string) =>
    request<SingleResponse<null>>(`${RETURN_BASE}/${id}`, { method: "DELETE" }),
};
