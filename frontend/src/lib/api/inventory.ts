import { request, getStoredToken, API_BASE } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";

export interface ApiVariant {
  id: string;
  product_id: string;
  sku: string | null;
  attributes: Record<string, string>;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  image_url: string | null;
  is_active: boolean;
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
  description: string | null;
  image_url: string | null;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  is_active: boolean;
  has_variants: boolean;
  category_id: string | null;
  brand_id: string | null;
  unit_id: string | null;
  supplier_id: string | null;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  unit: { id: string; name: string; abbreviation: string | null } | null;
  supplier: { id: string; name: string } | null;
  variants: ApiVariant[];
}

export interface ApiCategory { id: string; name: string; description: string | null; }
export interface ApiBrand    { id: string; name: string; description: string | null; }
export interface ApiUnit     { id: string; name: string; abbreviation: string | null; }
export interface ApiSupplier { id: string; name: string; email: string | null; phone: string | null; address: string | null; is_active: boolean; }

const BASE = "/tenants/inventory";

export const inventoryApi = {
  // Products
  listProducts: (page = 1, pageSize = 100) =>
    request<PaginatedResponse<ApiProduct>>(`${BASE}/products?page=${page}&page_size=${pageSize}`),
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
};
