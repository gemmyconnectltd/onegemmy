const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("onegemmy_token");
}

export function setStoredToken(token: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("onegemmy_token", token);
  }
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("onegemmy_refresh_token");
}

export function setStoredRefreshToken(token: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("onegemmy_refresh_token", token);
  }
}

export function clearStoredTokens() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("onegemmy_token");
    localStorage.removeItem("onegemmy_refresh_token");
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    // FastAPI validation errors: detail is an array
    // App errors: detail is a string
    // Custom errors: message is a string
    const detail = Array.isArray(body.detail)
      ? body.detail.map((e: { msg: string }) => e.msg).join(", ")
      : body.detail || body.message || res.statusText;
    throw { status: res.status, detail };
  }
  return res.json();
}

export interface ApiTokenUserInfo {
  id: string;
  email: string;
  full_name: string;
  role: string;
  role_id: string | null;
  is_superuser: boolean;
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_slug: string | null;
  permissions: string[];
}

export interface ApiTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: ApiTokenUserInfo;
}

export interface ApiRegisterRequest {
  tenant_name: string;
  tenant_slug: string;
  email: string;
  password: string;
  full_name: string;
}

// ── Inventory ────────────────────────────────────────────────────────────────

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
  category_id: string | null;
  brand_id: string | null;
  unit_id: string | null;
  supplier_id: string | null;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  unit: { id: string; name: string; abbreviation: string | null } | null;
  supplier: { id: string; name: string } | null;
}

export interface ApiCategory { id: string; name: string; description: string | null; }
export interface ApiBrand    { id: string; name: string; description: string | null; }
export interface ApiUnit     { id: string; name: string; abbreviation: string | null; }
export interface ApiSupplier { id: string; name: string; email: string | null; phone: string | null; address: string | null; is_active: boolean; }

export interface PaginatedResponse<T> {
  data: { items: T[]; total: number; page: number; page_size: number; };
  message: string;
}
export interface SingleResponse<T> { data: T; message: string; }

const INV = "/tenants/inventory";

export const inventoryApi = {
  // Products
  listProducts: (page = 1, pageSize = 100) =>
    request<PaginatedResponse<ApiProduct>>(`${INV}/products?page=${page}&page_size=${pageSize}`),
  createProduct: (data: object) =>
    request<SingleResponse<ApiProduct>>(`${INV}/products`, { method: "POST", body: JSON.stringify(data) }),
  bulkCreateProducts: (items: object[]) =>
    request<SingleResponse<{ created: number; failed: number; errors: string[] }>>(`${INV}/products/bulk`, { method: "POST", body: JSON.stringify({ items }) }),
  updateProduct: (id: string, data: object) =>
    request<SingleResponse<ApiProduct>>(`${INV}/products/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteProduct: (id: string) =>
    request<SingleResponse<null>>(`${INV}/products/${id}`, { method: "DELETE" }),
  restockProduct: (id: string, data: { qty: number; mode: string; reason?: string; notes?: string }) =>
    request<SingleResponse<ApiProduct>>(`${INV}/products/${id}/restock`, { method: "POST", body: JSON.stringify(data) }),
  uploadProductImage: (id: string, file: File) => {
    const token = getStoredToken();
    const form = new FormData();
    form.append("file", file);
    return fetch(`${API_BASE}${INV}/products/${id}/image`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then((r) => r.json()) as Promise<SingleResponse<ApiProduct>>;
  },

  // Categories
  listCategories: () =>
    request<PaginatedResponse<ApiCategory>>(`${INV}/categories?page_size=200`),
  createCategory: (data: object) =>
    request<SingleResponse<ApiCategory>>(`${INV}/categories`, { method: "POST", body: JSON.stringify(data) }),
  updateCategory: (id: string, data: object) =>
    request<SingleResponse<ApiCategory>>(`${INV}/categories/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteCategory: (id: string) =>
    request<SingleResponse<null>>(`${INV}/categories/${id}`, { method: "DELETE" }),

  // Brands
  listBrands: () =>
    request<PaginatedResponse<ApiBrand>>(`${INV}/brands?page_size=200`),
  createBrand: (data: object) =>
    request<SingleResponse<ApiBrand>>(`${INV}/brands`, { method: "POST", body: JSON.stringify(data) }),
  updateBrand: (id: string, data: object) =>
    request<SingleResponse<ApiBrand>>(`${INV}/brands/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteBrand: (id: string) =>
    request<SingleResponse<null>>(`${INV}/brands/${id}`, { method: "DELETE" }),

  // Units
  listUnits: () =>
    request<PaginatedResponse<ApiUnit>>(`${INV}/units?page_size=200`),
  createUnit: (data: object) =>
    request<SingleResponse<ApiUnit>>(`${INV}/units`, { method: "POST", body: JSON.stringify(data) }),
  updateUnit: (id: string, data: object) =>
    request<SingleResponse<ApiUnit>>(`${INV}/units/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteUnit: (id: string) =>
    request<SingleResponse<null>>(`${INV}/units/${id}`, { method: "DELETE" }),

  // Suppliers
  listSuppliers: () =>
    request<PaginatedResponse<ApiSupplier>>(`${INV}/suppliers?page_size=200`),
  createSupplier: (data: object) =>
    request<SingleResponse<ApiSupplier>>(`${INV}/suppliers`, { method: "POST", body: JSON.stringify(data) }),
  updateSupplier: (id: string, data: object) =>
    request<SingleResponse<ApiSupplier>>(`${INV}/suppliers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteSupplier: (id: string) =>
    request<SingleResponse<null>>(`${INV}/suppliers/${id}`, { method: "DELETE" }),
};

export const authApi = {
  login: (email: string, password: string, tenant_slug?: string) =>
    request<{ data: ApiTokenResponse }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, tenant_slug }),
    }),
  register: (data: ApiRegisterRequest) =>
    request<{ data: ApiTokenResponse }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  refresh: (refresh_token: string) =>
    request<{ data: ApiTokenResponse }>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token }),
    }),
};
