import { request, getStoredToken, API_BASE, qs, filenameFromDisposition } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";
import { periodParams, type PeriodRange } from "@/lib/period";
export interface PictureImportResult {
  matched: number; skipped: number; pictures: { file: string; product: string; sku: string | null; count?: number }[]; problems: { file: string; reason: string }[];
  /** "excel" when the pictures came from pictures pasted into a spreadsheet. */
  source?: "excel"; total_pictures?: number; extra_pictures?: number;
}
export interface ProductGallery { main: string | null; gallery: { id: string; url: string; position: number }[] }

export interface ApiVariant {
  barcode?: string | null;
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

export type ProductVatTreatment = "standard" | "zero_rated" | "exempt" | "out_of_scope";
export const PRODUCT_VAT_OPTIONS: { value: ProductVatTreatment; label: string; hint: string }[] = [
  { value: "standard", label: "Standard-rated", hint: "The business's standard VAT rate" },
  { value: "zero_rated", label: "Zero-rated (0%)", hint: "A taxable supply at 0%, only where the law allows it" },
  { value: "exempt", label: "Exempt", hint: "Not taxable: no VAT, reported apart from zero-rated sales" },
  { value: "out_of_scope", label: "Out of scope", hint: "Outside the VAT system altogether" },
];
export interface VatClassificationInput { product_ids: string[]; vat_treatment: ProductVatTreatment; tax_code?: string | null; vat_reason?: string | null }

export interface ApiProduct {
  id: string;
  name: string;
  sku: string | null;
  barcode?: string | null;
  subcategory?: string | null;
  description: string | null;
  image_url: string | null;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  is_active: boolean;
  has_variants: boolean;
  tracks_serials?: boolean;
  conversion_factor?: number;
  category_id: string | null;
  brand_id: string | null;
  unit_id: string | null;
  supplier_id: string | null;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  unit: { id: string; name: string; abbreviation: string | null } | null;
  supplier: { id: string; name: string } | null;
  variants: ApiVariant[];
  /** null = not reviewed yet (priced as standard-rated, as before VAT classification existed). */
  vat_treatment?: ProductVatTreatment | null;
  tax_code?: string | null;
  vat_reason?: string | null;
  vat_reviewed_at?: string | null;
}

export interface ApiCategory { id: string; name: string; description: string | null; }

export interface ApiCategoryTemplateGroup { name: string; items: string[]; }
export interface ApiCategoryTemplate { id: string; name: string; industry: string; groups: ApiCategoryTemplateGroup[]; }
export interface ApiCategoryTemplates { tenant_industry: string | null; existing: string[]; templates: ApiCategoryTemplate[]; }
export interface ApiCategoryImportResult { created: ApiCategory[]; skipped: string[]; }
export interface ApiBrand    { id: string; name: string; description: string | null; }
export interface ApiUnit     { id: string; name: string; abbreviation: string | null; }
export interface ApiUnitSuggestion { name: string; abbreviation: string | null; }
export interface ApiUnitSuggestions { suggested: ApiUnitSuggestion[]; existing: string[]; }
export interface ApiUnitImportResult { created: ApiUnit[]; skipped: string[]; }
export interface ApiSupplier { id: string; name: string; email: string | null; phone: string | null; address: string | null; is_active: boolean; /** Days from ordering to delivery; used by Pesaa AI reorder advice. */ lead_time_days?: number | null; }

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
  total: number;
  page: number;
  page_size: number;
  generated_at: string;
  costing_method: string;
  summary: ValuationSummary;
  categories: CategoryValuation[];
  lines: ValuationLine[];
}

const BASE = "/tenants/inventory";

export const inventoryApi = {
  // Products
  /** Server-side low-stock report (every product at/below its own minimum) — the same rule Pesaa AI uses. */
  lowStockReport: () => request<SingleResponse<{ items: { id: string; name: string; stock: number; min_stock: number }[]; total: number }>>("/tenants/inventory/products/low-stock"),
  listProducts: (page = 1, pageSize = 100, search?: string, isActive?: boolean, period?: PeriodRange, categoryId?: string, vat?: string) =>
    request<PaginatedResponse<ApiProduct>>(`${BASE}/products${qs({ page, page_size: pageSize, search, category_id: categoryId, vat, is_active: isActive === undefined ? undefined : String(isActive), ...periodParams(period) })}`),
  /** Products per VAT treatment ("not_reviewed" for those nobody has classified) and whether this person may classify. */
  vatSummary: () => request<SingleResponse<{ counts: Record<string, number>; can_classify: boolean }>>(`${BASE}/products/vat-summary`),
  classifyVat: (data: VatClassificationInput) =>
    request<SingleResponse<{ updated: number; matched: number; not_found: number }>>(`${BASE}/products/vat-classification`, { method: "POST", body: JSON.stringify(data) }),
  createProduct: (data: object) =>
    request<SingleResponse<ApiProduct>>(`${BASE}/products`, { method: "POST", body: JSON.stringify(data) }),
  bulkCreateProducts: (items: object[]) =>
    request<SingleResponse<{ created: number; failed: number; errors: string[] }>>(`${BASE}/products/bulk`, { method: "POST", body: JSON.stringify({ items }) }),
  getProduct: (id: string) => request<SingleResponse<ApiProduct>>(`/tenants/inventory/products/${id}`),
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

  /** A ZIP of pictures named after each product's SKU or barcode. */
  importProductPictures: (file: File) => {
    const token = getStoredToken();
    const form = new FormData();
    form.append("file", file);
    return fetch(`${API_BASE}${BASE}/products/import-pictures`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form })
      .then(async (r) => { const body = await r.json(); if (!r.ok) throw body; return body; }) as Promise<SingleResponse<PictureImportResult>>;
  },

  // Product gallery: extra pictures beside the main one
  productGallery: (id: string) => request<SingleResponse<ProductGallery>>(`${BASE}/products/${id}/images`),
  addGalleryImage: (id: string, file: File) => {
    const token = getStoredToken();
    const form = new FormData();
    form.append("file", file);
    return fetch(`${API_BASE}${BASE}/products/${id}/images`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form })
      .then(async (r) => { const body = await r.json(); if (!r.ok) throw body; return body; }) as Promise<SingleResponse<ProductGallery>>;
  },
  removeGalleryImage: (id: string, imageId: string) => request<SingleResponse<ProductGallery>>(`${BASE}/products/${id}/images/${imageId}`, { method: "DELETE" }),
  makeMainImage: (id: string, imageId: string) => request<SingleResponse<ProductGallery>>(`${BASE}/products/${id}/images/${imageId}/make-main`, { method: "POST" }),

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
  categoryTemplates: () =>
    request<SingleResponse<ApiCategoryTemplates>>(`${BASE}/categories/templates`),
  importCategories: (names: string[]) =>
    request<SingleResponse<ApiCategoryImportResult>>(`${BASE}/categories/import`, { method: "POST", body: JSON.stringify({ names }) }),

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
  unitSuggestions: () =>
    request<SingleResponse<ApiUnitSuggestions>>(`${BASE}/units/suggestions`),
  importUnits: (units: ApiUnitSuggestion[]) =>
    request<SingleResponse<ApiUnitImportResult>>(`${BASE}/units/import`, { method: "POST", body: JSON.stringify({ units }) }),

  // Suppliers
  listSuppliers: (page = 1, pageSize = 20, search?: string) =>
    request<PaginatedResponse<ApiSupplier>>(`${BASE}/suppliers${qs({ page, page_size: pageSize, search })}`),
  createSupplier: (data: object) =>
    request<SingleResponse<ApiSupplier>>(`${BASE}/suppliers`, { method: "POST", body: JSON.stringify(data) }),
  bulkCreateSuppliers: (items: object[]) =>
    request<SingleResponse<{ created: number; skipped: number; failed: number; errors: string[] }>>(`${BASE}/suppliers/bulk`, { method: "POST", body: JSON.stringify({ items }) }),
  updateSupplier: (id: string, data: object) =>
    request<SingleResponse<ApiSupplier>>(`${BASE}/suppliers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteSupplier: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/suppliers/${id}`, { method: "DELETE" }),

  // Reports
  valuationReport: (page = 1, status = "all") =>
    request<SingleResponse<InventoryValuationReport>>(`${BASE}/reports/valuation${qs({ page, page_size: 50, status })}`),
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
    a.download = filenameFromDisposition(res, `inventory-valuation.${format}`);  // the server names it after the business and date
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
