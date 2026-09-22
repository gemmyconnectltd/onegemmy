import { request, qs } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";

export interface ApiCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  customer_type: string;
  is_active: boolean;
  created_at: string | null;
}

export interface ApiDeal {
  id: string;
  name: string;
  value: number;
  stage: string;
  probability: number;
  customer_id: string | null;
  owner_id: string | null;
  expected_close_date: string | null;
  notes: string | null;
  customer: { id: string; name: string; email: string | null; phone: string | null; address: string | null } | null;
  created_at: string | null;
}

export interface ApiOrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  sku: string | null;
  variant_attributes: Record<string, string> | null;
  unit_price: number;
  quantity: number;
  discount: number;
  line_total: number;
}

export interface ApiOrder {
  id: string;
  order_number: string;
  customer_id: string | null;
  deal_id: string | null;
  branch_id: string | null;
  created_by: string | null;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  notes: string | null;
  payment_method: string | null;
  amount_tendered: number | null;
  change_due: number | null;
  ordered_at: string | null;
  customer: { id: string; name: string; email: string | null; phone: string | null; address: string | null } | null;
  items: ApiOrderItem[];
  created_at: string | null;
}

export interface ApiReturnItem {
  id: string;
  return_id: string;
  order_item_id: string | null;
  product_id: string | null;
  product_name: string;
  quantity: number;
  refund_per_unit: number;
  line_refund: number;
}

export interface ApiReturn {
  id: string;
  return_number: string;
  order_id: string | null;
  customer_id: string | null;
  reason: string | null;
  refund_amount: number;
  status: string;
  processed_by: string | null;
  return_date: string;
  customer: { id: string; name: string; email: string | null; phone: string | null; address: string | null } | null;
  items: ApiReturnItem[];
  created_at: string | null;
}

export interface ApiTarget {
  id: string;
  name: string;
  target_value: number;
  achieved_value: number;
  unit: string;
  period: string;
  assigned_to: string | null;
  created_at: string | null;
}

const BASE = "/tenants/sales";

export const salesApi = {
  // Customers
  listCustomers: (page = 1, pageSize = 20, search?: string, customerType?: string) =>
    request<PaginatedResponse<ApiCustomer>>(`${BASE}/customers${qs({ page, page_size: pageSize, search, customer_type: customerType })}`),
  createCustomer: (data: object) =>
    request<SingleResponse<ApiCustomer>>(`${BASE}/customers`, { method: "POST", body: JSON.stringify(data) }),
  bulkCreateCustomers: (items: object[]) =>
    request<SingleResponse<{ created: number; skipped: number; failed: number; errors: string[] }>>(`${BASE}/customers/bulk`, { method: "POST", body: JSON.stringify({ items }) }),
  updateCustomer: (id: string, data: object) =>
    request<SingleResponse<ApiCustomer>>(`${BASE}/customers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteCustomer: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/customers/${id}`, { method: "DELETE" }),

  // Deals
  listDeals: (page = 1, pageSize = 100, stage?: string) =>
    request<PaginatedResponse<ApiDeal>>(`${BASE}/deals?page=${page}&page_size=${pageSize}${stage ? `&stage=${stage}` : ""}`),
  createDeal: (data: object) =>
    request<SingleResponse<ApiDeal>>(`${BASE}/deals`, { method: "POST", body: JSON.stringify(data) }),
  updateDeal: (id: string, data: object) =>
    request<SingleResponse<ApiDeal>>(`${BASE}/deals/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteDeal: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/deals/${id}`, { method: "DELETE" }),

  // Orders
  listOrders: (page = 1, pageSize = 20, status?: string, search?: string) =>
    request<PaginatedResponse<ApiOrder>>(`${BASE}/orders${qs({ page, page_size: pageSize, status, search })}`),
  createOrder: (data: object) =>
    request<SingleResponse<ApiOrder>>(`${BASE}/orders`, { method: "POST", body: JSON.stringify(data) }),
  bulkCreateOrders: (items: object[]) =>
    request<SingleResponse<{ created: number; failed: number; errors: string[] }>>(`${BASE}/orders/bulk`, { method: "POST", body: JSON.stringify({ items }) }),
  updateOrder: (id: string, data: object) =>
    request<SingleResponse<ApiOrder>>(`${BASE}/orders/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteOrder: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/orders/${id}`, { method: "DELETE" }),

  // Returns
  listReturns: (page = 1, pageSize = 100, status?: string) =>
    request<PaginatedResponse<ApiReturn>>(`${BASE}/returns?page=${page}&page_size=${pageSize}${status ? `&status=${status}` : ""}`),
  createReturn: (data: object) =>
    request<SingleResponse<ApiReturn>>(`${BASE}/returns`, { method: "POST", body: JSON.stringify(data) }),
  updateReturn: (id: string, data: object) =>
    request<SingleResponse<ApiReturn>>(`${BASE}/returns/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteReturn: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/returns/${id}`, { method: "DELETE" }),

  // Targets
  listTargets: (page = 1, pageSize = 100, period?: string) =>
    request<PaginatedResponse<ApiTarget>>(`${BASE}/targets?page=${page}&page_size=${pageSize}${period ? `&period=${encodeURIComponent(period)}` : ""}`),
  createTarget: (data: object) =>
    request<SingleResponse<ApiTarget>>(`${BASE}/targets`, { method: "POST", body: JSON.stringify(data) }),
  updateTarget: (id: string, data: object) =>
    request<SingleResponse<ApiTarget>>(`${BASE}/targets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteTarget: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/targets/${id}`, { method: "DELETE" }),
};
