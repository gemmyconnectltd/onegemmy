import { request, qs, downloadFile } from "./client";
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
  is_service?: boolean;
  expense_account_id?: string | null;
  tax_rate?: number | string | null;
  received_quantity?: string | number;
  update_catalog_cost?: boolean;
  selling_price?: string | number | null;
}

export interface PurchaseOrder {
  id: string;
  tenant_id: string;
  reference: string;
  status: string;
  billing_status?: string | null;
  payment_status?: string | null;
  branch_id?: string | null;
  order_date?: string | null;
  payment_terms_days?: number | null;
  supplier_reference?: string | null;
  delivery_instructions?: string | null;
  included_vat?: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  // Currency context. Amounts are in `currency_code` (null on rows from before multi-currency =
  // the tenant's base currency); `exchange_rate` is base-currency units per 1 unit of it, frozen
  // when the document became financially effective.
  currency_code?: string | null;
  exchange_rate?: number | null;
  base_subtotal?: number | null;
  base_discount?: number | null;
  base_tax?: number | null;
  base_total?: number | null;
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
  is_service?: boolean;
  expense_account_id?: string | null;
  tax_rate?: 0 | 18;
  product_id?: string | null;
  variant_id?: string | null;
  product_name: string;
  sku?: string | null;
  unit_cost: number | string;
  quantity: number | string;
  update_catalog_cost?: boolean;
  selling_price?: string | null;
}

export interface PurchaseCreateInput {
  supplier_id?: string | null;
  branch_id?: string | null;
  order_date?: string | null;
  payment_terms_days?: number | null;
  supplier_reference?: string | null;
  delivery_instructions?: string | null;
  client_reference?: string;
  expected_date?: string | null;
  status?: string;
  discount?: number;
  tax?: number;
  notes?: string | null;
  /** Foreign-currency purchase; omit both for the tenant's base currency. */
  currency_code?: string | null;
  exchange_rate?: number | null;
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
  currency_code?: string | null;
  base_amount?: string | null;
  refund_base_amount?: string | null;
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
  client_reference?: string;
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

export interface PurchaseHistoryFilters { search?: string; from_date?: string; to_date?: string; supplier_id?: string; currency_code?: string; sort?: string; direction?: string; }
export interface PurchaseHistorySummary { total: number; total_value: string; counts: Record<string, number>; }
export interface PurchaseAttachment {id: string; name: string; size: number; created_at: string}
export interface GoodsReceipt {
  id: string; reference: string; purchase_order_id: string; branch_id: string | null;
  received_by: string | null; received_at: string; amount: string;
  po_reference: string | null; supplier_name: string | null; currency_code: string | null;
  lines: { purchase_item_id: string; quantity: string }[];
}
export interface ReceiptInput { client_reference: string; due_date?: string | null; lines: { purchase_item_id: string; quantity: string }[] }
export interface PurchasingBill {
  is_overdue?: boolean;
  supplier_invoice_reference?: string | null;
  id: string; reference: string; purchase_order_id: string; receipt_id: string | null;
  supplier_id: string | null; supplier_name: string | null; po_reference: string | null;
  amount: number; amount_paid: number; balance: number; status: string;
  bill_date: string; due_date: string | null; currency_code: string | null;
}
export interface PurchasingPayment { id: string; reference: string; amount: number; paid_at: string; payment_method: string | null; currency_code: string | null }
export interface PurchasingOverview { total: number; counts: Record<string, number>; commitments: {currency_code: string | null; amount: string}[]; outstanding: {currency_code: string | null; amount: string}[] }
export const procurementApi = {
  attachments: (id: string) => request<SingleResponse<PurchaseAttachment[]>>(`${BASE}/${id}/attachments`),
  attach: (id: string, file: File) => {const body = new FormData(); body.append("file", file); return request<SingleResponse<PurchaseAttachment>>(`${BASE}/${id}/attachments`, {method: "POST", body});},
  downloadAttachment: (id: string, attachmentId: string) => downloadFile(`${BASE}/${id}/attachments/${attachmentId}`, "purchase-attachment"),
  downloadPurchase: (id: string) => downloadFile(`${BASE}/${id}/pdf`, "purchase-order.pdf"),
  exportOrders: (status: string, filters: PurchaseHistoryFilters) => downloadFile(`${BASE}/export/csv${qs({status: status || undefined, ...filters})}`, "purchase-orders.csv"),
  overview: (filters: PurchaseHistoryFilters) => request<SingleResponse<PurchasingOverview>>(`/tenants/procurement/overview${qs({...filters})}`),
  receipts: (page: number, orderId?: string) => request<PaginatedResponse<GoodsReceipt>>(`/tenants/procurement/goods-receipts${qs({page, page_size: 25, purchase_order_id: orderId})}`),
  confirmReceipt: (id: string, data: ReceiptInput) => request<SingleResponse<PurchaseOrder>>(`${BASE}/${id}/receipts`, {method: "POST", body: JSON.stringify(data)}),
  action: (id: string, action: string) => request<SingleResponse<PurchaseOrder>>(`${BASE}/${id}/actions/${action}`, {method: "POST"}),
  bills: (page: number, orderId?: string, status?: string) => request<PaginatedResponse<PurchasingBill>>(`/tenants/procurement/supplier-bills${qs({page, page_size: 25, purchase_order_id: orderId, status})}`),
  bill: (id: string) => request<SingleResponse<PurchasingBill>>(`/tenants/procurement/supplier-bills/${id}`),
  payments: (id: string, page: number) => request<PaginatedResponse<PurchasingPayment>>(`/tenants/procurement/supplier-bills/${id}/payments${qs({page, page_size: 25})}`),
  updateBill: (id: string, data: object) => request<SingleResponse<PurchasingBill>>(`/tenants/procurement/supplier-bills/${id}`, {method: "PATCH", body: JSON.stringify(data)}),
  payBill: (id: string, data: object) => request<SingleResponse<PurchasingBill>>(`/tenants/procurement/supplier-bills/${id}/payments`, {method: "POST", body: JSON.stringify(data)}),
  listPurchaseOrders: (status?: string, page = 1, pageSize = 100, filters?: PurchaseHistoryFilters) =>
    request<PaginatedResponse<PurchaseOrder> & {data: {summary: PurchaseHistorySummary}}>(
      `${BASE}${qs({page, page_size: pageSize, status, ...filters})}`,
    ),
  activity: (id: string, page: number) => request<PaginatedResponse<{id: string; action: string; summary: string; actor: string | null; created_at: string}>>(`${BASE}/${id}/activity${qs({page, page_size: 25})}`),
  getPurchaseOrder: (id: string) =>
    request<SingleResponse<PurchaseOrder>>(`${BASE}/${id}`),
  createPurchaseOrder: (data: PurchaseCreateInput) =>
    request<SingleResponse<PurchaseOrder>>(BASE, { method: "POST", body: JSON.stringify(data) }),
  updatePurchaseOrder: (id: string, data: object) =>
    request<SingleResponse<PurchaseOrder>>(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  receivePurchaseOrder: (id: string, dueDate?: string) =>
    request<SingleResponse<PurchaseOrder>>(`${BASE}/${id}/receive`, { method: "POST", body: JSON.stringify({ due_date: dueDate || null }) }),
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
  listPurchaseReturns: (page = 1, pageSize = 25, search = "") =>
    request<PaginatedResponse<PurchaseReturn>>(`${RETURN_BASE}${qs({page, page_size: pageSize, search})}`),
  createPurchaseReturn: (data: PurchaseReturnCreateInput) =>
    request<SingleResponse<PurchaseReturn>>(RETURN_BASE, { method: "POST", body: JSON.stringify(data) }),
  refundPurchaseReturn: (id: string, data: object) =>
    request<SingleResponse<PurchaseReturn>>(`${RETURN_BASE}/${id}/refund`, { method: "POST", body: JSON.stringify(data) }),
  replacePurchaseReturn: (id: string) =>
    request<SingleResponse<PurchaseReturn>>(`${RETURN_BASE}/${id}/replace`, { method: "POST" }),
  deletePurchaseReturn: (id: string) =>
    request<SingleResponse<null>>(`${RETURN_BASE}/${id}`, { method: "DELETE" }),
};
