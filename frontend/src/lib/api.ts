const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

let _token: string | null = null;

export function getStoredToken(): string | null {
  if (_token) return _token;
  if (typeof window !== "undefined") {
    _token = localStorage.getItem("onegemmy_token");
  }
  return _token;
}

export function setStoredToken(token: string) {
  _token = token;
  if (typeof window !== "undefined") {
    localStorage.setItem("onegemmy_token", token);
  }
}

export function clearStoredToken() {
  _token = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem("onegemmy_token");
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw { status: res.status, detail: body.detail || res.statusText };
  }
  return res.json();
}

export interface ApiTokenResponse {
  access_token: string;
  token_type: string;
}

export interface ApiUserResponse {
  id: number;
  email: string;
  name: string;
  platform_role: string;
  role_id: number | null;
  company_id: number | null;
  shop_id: number | null;
  is_active: boolean;
  role: {
    id: number;
    name: string;
    description: string | null;
    color: string;
    is_system: boolean;
    permissions: string[];
  } | null;
  company: {
    id: number;
    name: string;
    slug: string;
    plan: string;
  } | null;
  shop: {
    id: number;
    company_id: number;
    name: string;
    location: string;
    status: string;
  } | null;
}

export interface ApiProductResponse {
  id: number;
  name: string;
  sku: string;
  price: number;
  cost: number;
  stock_quantity: number;
  min_stock: number;
  category: string;
  is_active: boolean;
}

export interface ApiSaleResponse {
  id: number;
  items: {
    product_id: number;
    product_name: string;
    quantity: number;
    price: number;
    discount: number;
    total: number;
  }[];
  subtotal: number;
  discount: number;
  total: number;
  payment_method: string;
  customer_id: number | null;
  customer_name: string | null;
  created_at: string;
}

export interface ApiExpenseResponse {
  id: number;
  description: string;
  amount: number;
  category: string;
  date: string;
  created_at: string;
}

export interface ApiCustomerResponse {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  total_purchases: number;
  last_purchase_at: string | null;
  created_at: string;
}

export interface ApiDashboardResponse {
  today_sales: number;
  today_expenses: number;
  today_profit: number;
  cash_available: number;
  low_stock_count: number;
  total_products: number;
  total_customers: number;
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<ApiTokenResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    register: (name: string, email: string, password: string, company_name?: string) =>
      request<ApiTokenResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password, company_name }),
      }),
    me: () => request<ApiUserResponse>("/auth/me"),
  },
  dashboard: {
    summary: () => request<ApiDashboardResponse>("/dashboard/summary"),
  },
  products: {
    list: () => request<ApiProductResponse[]>("/products/"),
    create: (data: { name: string; sku: string; price: number; cost: number; stock: number; min_stock: number; category: string }) =>
      request<ApiProductResponse>("/products/", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<{ name: string; sku: string; price: number; cost: number; min_stock: number; category: string }>) =>
      request<ApiProductResponse>(`/products/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  },
  sales: {
    list: (date?: string) => request<ApiSaleResponse[]>(`/sales/${date ? `?date=${date}` : ""}`),
    create: (data: { items: { product_id: number; quantity: number; price: number; discount: number }[]; payment_method: string; customer_id?: number }) =>
      request<ApiSaleResponse>("/sales/", { method: "POST", body: JSON.stringify(data) }),
  },
  expenses: {
    list: (date?: string) => request<ApiExpenseResponse[]>(`/expenses/${date ? `?date=${date}` : ""}`),
    create: (data: { description: string; amount: number; category: string; date: string }) =>
      request<ApiExpenseResponse>("/expenses/", { method: "POST", body: JSON.stringify(data) }),
  },
  customers: {
    list: () => request<ApiCustomerResponse[]>("/customers/"),
    create: (data: { name: string; phone: string; email?: string }) =>
      request<ApiCustomerResponse>("/customers/", { method: "POST", body: JSON.stringify(data) }),
  },
  inventory: {
    addStock: (productId: number, quantity: number, notes?: string) =>
      request<{ message: string }>(`/inventory/${productId}/add-stock`, { method: "POST", body: JSON.stringify({ quantity, notes }) }),
  },
  settings: {
    get: () => request<{ shop_name: string; currency: string; phone: string; address: string }>("/settings/"),
    update: (data: { shop_name?: string; currency?: string; phone?: string; address?: string }) =>
      request<{ message: string }>("/settings/", { method: "PUT", body: JSON.stringify(data) }),
    backup: () => request<{ download_url: string }>("/settings/backup"),
  },
};
