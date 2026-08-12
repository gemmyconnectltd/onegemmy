import { request } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";

export interface RepairJobPart {
  id: string;
  job_id: string;
  product_id: string | null;
  part_name: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
  created_at: string | null;
}

export interface RepairJob {
  id: string;
  tenant_id: string;
  job_number: string;
  status: string;
  device_type: string;
  device_brand: string | null;
  device_model: string | null;
  serial_number: string | null;
  imei: string | null;
  device_condition: string | null;
  reported_issue: string;
  diagnosis: string | null;
  resolution_notes: string | null;
  estimated_cost: number;
  final_cost: number;
  received_at: string | null;
  promised_at: string | null;
  completed_at: string | null;
  customer_id: string | null;
  assigned_to: string | null;
  customer_name: string | null;
  technician_name: string | null;
  parts: RepairJobPart[];
  created_at: string | null;
  updated_at: string | null;
}

export interface InventoryBatch {
  id: string;
  tenant_id: string;
  product_id: string;
  variant_id: string | null;
  purchase_order_id: string | null;
  batch_number: string;
  quantity: number;
  quantity_remaining: number;
  unit_cost: number;
  manufactured_date: string | null;
  expiry_date: string | null;
  received_at: string | null;
  supplier_id: string | null;
  notes: string | null;
  product_name: string | null;
  supplier_name: string | null;
  days_to_expiry: number | null;
  created_at: string | null;
}

export interface ApiSerial {
  id: string;
  tenant_id: string;
  product_id: string;
  variant_id: string | null;
  serial_number: string;
  imei: string | null;
  status: string;
  warranty_months: number;
  purchase_price: number | null;
  notes: string | null;
  product_name: string | null;
  variant_attributes: Record<string, string> | null;
  created_at: string | null;
}

export interface ApiStockTransferItem {
  id: string;
  transfer_id: string;
  product_id: string | null;
  product_name: string;
  sku: string | null;
  quantity: number;
}

export interface ApiStockTransfer {
  id: string;
  tenant_id: string;
  transfer_number: string;
  from_branch_id: string | null;
  to_branch_id: string | null;
  from_branch_name: string | null;
  to_branch_name: string | null;
  status: string;
  notes: string | null;
  items: ApiStockTransferItem[];
  created_at: string | null;
}

export interface ApiBranch {
  id: string;
  name: string;
  location: string | null;
}

export interface ApiWarrantyClaim {
  id: string;
  tenant_id: string;
  claim_number: string;
  serial_id: string;
  serial_number: string | null;
  product_name: string | null;
  issue_description: string;
  status: string;
  resolution_notes: string | null;
  created_at: string | null;
}

const REPAIRS = "/tenants/repairs";
const BATCHES = "/tenants/inventory/batches";
const SERIALS = "/tenants/inventory/serials";
const TRANSFERS = "/tenants/inventory/transfers";
const BRANCHES = "/tenants/branches";
const WARRANTY = "/tenants/inventory/warranty";

export const repairsApi = {
  list: (status?: string, page = 1, pageSize = 50) =>
    request<PaginatedResponse<RepairJob>>(`${REPAIRS}?page=${page}&page_size=${pageSize}${status ? `&status=${status}` : ""}`),
  get: (id: string) =>
    request<SingleResponse<RepairJob>>(`${REPAIRS}/${id}`),
  create: (data: object) =>
    request<SingleResponse<RepairJob>>(REPAIRS, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: object) =>
    request<SingleResponse<RepairJob>>(`${REPAIRS}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<SingleResponse<null>>(`${REPAIRS}/${id}`, { method: "DELETE" }),
};

export const transfersApi = {
  list: (page = 1, pageSize = 100, status?: string) => {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (status) params.set("status", status);
    return request<PaginatedResponse<ApiStockTransfer>>(`${TRANSFERS}?${params}`);
  },
  create: (data: object) =>
    request<SingleResponse<ApiStockTransfer>>(TRANSFERS, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: object) =>
    request<SingleResponse<ApiStockTransfer>>(`${TRANSFERS}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<SingleResponse<null>>(`${TRANSFERS}/${id}`, { method: "DELETE" }),
};

export const branchesApi = {
  list: () => request<PaginatedResponse<ApiBranch>>(BRANCHES),
};

export const warrantyApi = {
  list: (page = 1, pageSize = 100, status?: string) => {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (status) params.set("status", status);
    return request<PaginatedResponse<ApiWarrantyClaim>>(`${WARRANTY}?${params}`);
  },
  create: (data: object) =>
    request<SingleResponse<ApiWarrantyClaim>>(WARRANTY, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: object) =>
    request<SingleResponse<ApiWarrantyClaim>>(`${WARRANTY}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
};

export const serialsApi = {
  list: (page = 1, pageSize = 100, productId?: string, status?: string) => {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (productId) params.set("product_id", productId);
    if (status) params.set("status", status);
    return request<PaginatedResponse<ApiSerial>>(`${SERIALS}?${params}`);
  },
  bulkCreate: (items: object[]) =>
    request<PaginatedResponse<ApiSerial>>(SERIALS, { method: "POST", body: JSON.stringify(items) }),
  delete: (id: string) =>
    request<SingleResponse<null>>(`${SERIALS}/${id}`, { method: "DELETE" }),
};

export const batchesApi = {
  list: (productId?: string, expiringInDays?: number, page = 1, pageSize = 100) => {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (productId) params.set("product_id", productId);
    if (expiringInDays != null) params.set("expiring_in_days", String(expiringInDays));
    return request<PaginatedResponse<InventoryBatch>>(`${BATCHES}?${params}`);
  },
  create: (data: object) =>
    request<SingleResponse<InventoryBatch>>(BATCHES, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: object) =>
    request<SingleResponse<InventoryBatch>>(`${BATCHES}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<SingleResponse<null>>(`${BATCHES}/${id}`, { method: "DELETE" }),
};
