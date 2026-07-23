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

export interface ApiShopResponse {
  id: number;
  company_id: number;
  name: string;
  location: string;
  status: string;
}

export interface ApiRoleResponse {
  id: number;
  company_id: number | null;
  name: string;
  description: string | null;
  color: string;
  is_system: boolean;
  permissions: string[];
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
  admin: {
    users: () => request<ApiUserResponse[]>("/admin/users/"),
    roles: () => request<ApiRoleResponse[]>("/admin/roles/"),
    shops: () => request<ApiShopResponse[]>("/admin/shops/"),
  },
};
