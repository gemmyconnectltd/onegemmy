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
    throw { status: res.status, detail: body.detail || res.statusText };
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
