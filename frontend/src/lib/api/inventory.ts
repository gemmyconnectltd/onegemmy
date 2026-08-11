import { request, getStoredToken, API_BASE } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";
export interface ApiVariant {
  id: string;
  product_id: string;
  sku: string | null;
  barcode: string | null;
  attributes: Record<string, string>;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  image_url: string | null;
  is_active: boolean;
  promo_price: number | null;
  promo_ends_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ApiVariantListItem extends ApiVariant {
  product_name: string | null;
  product_sku: string | null;
}

export interface ApiProduct {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  image_url: string | null;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  is_active: boolean;
  has_variants: boolean;
  tracks_serials: boolean;
  sale_by_weight: boolean;
  conversion_factor: number;
  promo_price: number | null;
  promo_ends_at: string | null;
  category_id: string | null;
  brand_id: string | null;
  unit_id: string | null;
  sale_unit_id: string | null;
  purchase_unit_id: string | null;
  supplier_id: string | null;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  unit: { id: string; name: string; abbreviation: string | null } | null;
  sale_unit: { id: string; name: string; abbreviation: string | null } | null;
  purchase_unit: { id: string; name: string; abbreviation: string | null } | null;
  supplier: { id: string; name: string } | null;
  variants: ApiVariant[];
}

export interface ApiCategory { id: string; name: string; description: string | null; }
export interface ApiBrand    { id: string; name: string; description: string | null; }
export interface ApiUnit     { id: string; name: string; abbreviation: string | null; }
export interface ApiSupplier { id: string; name: string; email: string | null; phone: string | null; address: string | null; is_active: boolean; }

export interface ValuationLine {
  id: string;
  product_id: string | null;
  kind: "product" | "variant";
  name: string;
  sku: string | null;
  category: string | null;
  brand: string | null;
  unit: string | null;
  stock: number;
  min_stock: number;
  cost: number;
  price: number;
  cost_value: number;
  retail_value: number;
  margin: number;
  margin_pct: number | null;
  status: "out" | "low" | "ok";
}

export interface CategoryValuation {
  name: string;
  units: number;
  cost_value: number;
  retail_value: number;
  margin: number;
}

export interface ValuationSummary {
  product_count: number;
  line_count: number;
  variant_count: number;
  total_units: number;
  cost_value: number;
  retail_value: number;
  margin: number;
  margin_pct: number | null;
  low_stock_count: number;
  out_of_stock_count: number;
}

export interface InventoryValuationReport {
  generated_at: string;
  costing_method: string;
  summary: ValuationSummary;
  categories: CategoryValuation[];
  lines: ValuationLine[];
}

export interface ApiSerial {
  id: string;
  tenant_id: string;
  product_id: string;
  variant_id: string | null;
  serial_number: string;
  imei: string | null;
  status: "in_stock" | "reserved" | "sold" | "returned" | "under_repair";
  warranty_months: number;
  warranty_expires_at: string | null;
  purchase_price: number;
  order_item_id: string | null;
  notes: string | null;
  product_name: string | null;
  variant_attributes: Record<string, string> | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ApiWarrantyClaim {
  id: string;
  tenant_id: string;
  claim_number: string;
  serial_id: string;
  order_id: string | null;
  status: string;
  issue_description: string;
  resolution_notes: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  serial_number: string | null;
  product_name: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ApiStockTransfer {
  id: string;
  tenant_id: string;
  transfer_number: string;
  from_branch_id: string | null;
  to_branch_id: string | null;
  status: "pending" | "in_transit" | "completed" | "cancelled";
  notes: string | null;
  created_by: string | null;
  completed_at: string | null;
  from_branch_name: string | null;
  to_branch_name: string | null;
  items: {
    id: string;
    transfer_id: string;
    product_id: string | null;
    variant_id: string | null;
    product_name: string;
    sku: string | null;
    variant_attributes: Record<string, string> | null;
    quantity: number;
  }[];
  created_at: string | null;
  updated_at: string | null;
}

export interface LowStockLine {
  id: string;
  kind: "product" | "variant";
  product_id: string | null;
  variant_id: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  stock: number;
  min_stock: number;
  suggested_qty: number;
}

export interface LowStockReport {
  items: LowStockLine[];
  total: number;
}

export interface MarkdownLine {
  id: string;
  kind: "product" | "variant";
  product_id: string;
  variant_id: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  promo_price: number;
  promo_ends_at: string | null;
  savings: number;
}

export interface MarkdownReport {
  items: MarkdownLine[];
  total: number;
}

export interface SizeSelloutReport {
  attribute_key: string;
  items: { size: string; qty_sold: number; revenue: number }[];
}

const BASE = "/tenants/inventory";

export interface ApiBranch {
  id: string;
  name: string;
  location: string | null;
  status: string;
}

export const inventoryApi = {
  listMyBranches: () =>
    request<PaginatedResponse<ApiBranch>>("/tenants/branches?page_size=200"),

  // Products
  listProducts: (page = 1, pageSize = 100, search?: string) =>
    request<PaginatedResponse<ApiProduct>>(
      `${BASE}/products?page=${page}&page_size=${pageSize}${search ? `&search=${encodeURIComponent(search)}` : ""}`,
    ),
  getProductByBarcode: (code: string) =>
    request<SingleResponse<ApiProduct | ApiVariantListItem>>(`${BASE}/products/barcode/${encodeURIComponent(code)}`),
  createProduct: (data: object) =>
    request<SingleResponse<ApiProduct>>(`${BASE}/products`, { method: "POST", body: JSON.stringify(data) }),
  bulkCreateProducts: (items: object[]) =>
    request<SingleResponse<{ created: number; failed: number; errors: string[] }>>(`${BASE}/products/bulk`, { method: "POST", body: JSON.stringify({ items }) }),
  updateProduct: (id: string, data: object) =>
    request<SingleResponse<ApiProduct>>(`${BASE}/products/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteProduct: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/products/${id}`, { method: "DELETE" }),
  restockProduct: (id: string, data: { qty: number; mode: string; reason?: string; notes?: string }) =>
    request<SingleResponse<ApiProduct>>(`${BASE}/products/${id}/restock`, { method: "POST", body: JSON.stringify(data) }),
  uploadProductImage: (id: string, file: File) => {
    const token = getStoredToken();
    const form = new FormData();
    form.append("file", file);
    return fetch(`${API_BASE}${BASE}/products/${id}/image`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then((r) => r.json()) as Promise<SingleResponse<ApiProduct>>;
  },

  // Variants
  listAllVariants: (page = 1, pageSize = 200) =>
    request<PaginatedResponse<ApiVariantListItem>>(`${BASE}/variants?page=${page}&page_size=${pageSize}`),
  listVariants: (productId: string) =>
    request<SingleResponse<ApiVariant[]>>(`${BASE}/products/${productId}/variants`),
  createVariant: (productId: string, data: object) =>
    request<SingleResponse<ApiVariant>>(`${BASE}/products/${productId}/variants`, { method: "POST", body: JSON.stringify(data) }),
  updateVariant: (productId: string, id: string, data: object) =>
    request<SingleResponse<ApiVariant>>(`${BASE}/products/${productId}/variants/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  restockVariant: (productId: string, id: string, data: { qty: number; mode: string }) =>
    request<SingleResponse<ApiVariant>>(`${BASE}/products/${productId}/variants/${id}/restock`, { method: "POST", body: JSON.stringify(data) }),
  deleteVariant: (productId: string, id: string) =>
    request<SingleResponse<null>>(`${BASE}/products/${productId}/variants/${id}`, { method: "DELETE" }),
  generateVariants: (productId: string, data: { attributes: Record<string, string[]>; base_price: number; base_cost?: number; price_deltas?: Record<string, number> }) =>
    request<SingleResponse<{ created: number; skipped: number; variants: string[] }>>(
      `${BASE}/products/${productId}/variants/generate`, { method: "POST", body: JSON.stringify(data) }),

  // Serials
  listSerials: (page = 1, pageSize = 50, productId?: string, status?: string) =>
    request<PaginatedResponse<ApiSerial>>(
      `${BASE}/serials?page=${page}&page_size=${pageSize}${productId ? `&product_id=${productId}` : ""}${status ? `&status=${status}` : ""}`),
  createSerials: (items: object[]) =>
    request<SingleResponse<ApiSerial[]>>(`${BASE}/serials`, { method: "POST", body: JSON.stringify({ items }) }),
  updateSerial: (id: string, data: object) =>
    request<SingleResponse<ApiSerial>>(`${BASE}/serials/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteSerial: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/serials/${id}`, { method: "DELETE" }),

  // Warranty
  listWarrantyClaims: (page = 1, pageSize = 50, status?: string) =>
    request<PaginatedResponse<ApiWarrantyClaim>>(
      `${BASE}/warranty?page=${page}&page_size=${pageSize}${status ? `&status=${status}` : ""}`),
  createWarrantyClaim: (data: { serial_id: string; order_id?: string; issue_description: string }) =>
    request<SingleResponse<ApiWarrantyClaim>>(`${BASE}/warranty`, { method: "POST", body: JSON.stringify(data) }),
  updateWarrantyClaim: (id: string, data: { status?: string; resolution_notes?: string }) =>
    request<SingleResponse<ApiWarrantyClaim>>(`${BASE}/warranty/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  // Stock transfers
  listTransfers: (page = 1, pageSize = 50, status?: string) =>
    request<PaginatedResponse<ApiStockTransfer>>(
      `${BASE}/transfers?page=${page}&page_size=${pageSize}${status ? `&status=${status}` : ""}`),
  createTransfer: (data: object) =>
    request<SingleResponse<ApiStockTransfer>>(`${BASE}/transfers`, { method: "POST", body: JSON.stringify(data) }),
  updateTransfer: (id: string, data: object) =>
    request<SingleResponse<ApiStockTransfer>>(`${BASE}/transfers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteTransfer: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/transfers/${id}`, { method: "DELETE" }),

  // Retail reports & alerts
  lowStockReport: () =>
    request<SingleResponse<LowStockReport>>(`${BASE}/products/low-stock`),
  activeMarkdowns: () =>
    request<SingleResponse<MarkdownReport>>(`${BASE}/markdowns`),
  sizeSellout: (productId?: string, attributeKey = "Size") =>
    request<SingleResponse<SizeSelloutReport>>(
      `${BASE}/reports/size-sellout?attribute_key=${encodeURIComponent(attributeKey)}${productId ? `&product_id=${productId}` : ""}`),

  // Categories
  listCategories: () =>
    request<PaginatedResponse<ApiCategory>>(`${BASE}/categories?page_size=200`),
  createCategory: (data: object) =>
    request<SingleResponse<ApiCategory>>(`${BASE}/categories`, { method: "POST", body: JSON.stringify(data) }),
  updateCategory: (id: string, data: object) =>
    request<SingleResponse<ApiCategory>>(`${BASE}/categories/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteCategory: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/categories/${id}`, { method: "DELETE" }),

  // Brands
  listBrands: () =>
    request<PaginatedResponse<ApiBrand>>(`${BASE}/brands?page_size=200`),
  createBrand: (data: object) =>
    request<SingleResponse<ApiBrand>>(`${BASE}/brands`, { method: "POST", body: JSON.stringify(data) }),
  updateBrand: (id: string, data: object) =>
    request<SingleResponse<ApiBrand>>(`${BASE}/brands/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteBrand: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/brands/${id}`, { method: "DELETE" }),

  // Units
  listUnits: () =>
    request<PaginatedResponse<ApiUnit>>(`${BASE}/units?page_size=200`),
  createUnit: (data: object) =>
    request<SingleResponse<ApiUnit>>(`${BASE}/units`, { method: "POST", body: JSON.stringify(data) }),
  updateUnit: (id: string, data: object) =>
    request<SingleResponse<ApiUnit>>(`${BASE}/units/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteUnit: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/units/${id}`, { method: "DELETE" }),

  // Suppliers
  listSuppliers: () =>
    request<PaginatedResponse<ApiSupplier>>(`${BASE}/suppliers?page_size=200`),
  createSupplier: (data: object) =>
    request<SingleResponse<ApiSupplier>>(`${BASE}/suppliers`, { method: "POST", body: JSON.stringify(data) }),
  updateSupplier: (id: string, data: object) =>
    request<SingleResponse<ApiSupplier>>(`${BASE}/suppliers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteSupplier: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/suppliers/${id}`, { method: "DELETE" }),

  // Reports
  valuationReport: () =>
    request<SingleResponse<InventoryValuationReport>>(`${BASE}/reports/valuation`),
  exportValuationReport: async (format: "csv" | "pdf") => {
    const token = getStoredToken();
    const res = await fetch(`${API_BASE}${BASE}/reports/valuation/export?format=${format}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-valuation-${new Date().toISOString().slice(0, 10)}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
