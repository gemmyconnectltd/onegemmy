import { clearApiQueryCache } from "./queryClient";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://onegemmy.onrender.com/api/v1";

const REQUEST_TIMEOUT_MS = 60_000;

let _refreshPromise: Promise<string | null> | null = null;
let _onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(fn: () => void) {
  _onSessionExpired = fn;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export function clearApiCache() {
  clearApiQueryCache();
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("onegemmy_token");
}

export function setStoredToken(token: string) {
  if (typeof window !== "undefined") localStorage.setItem("onegemmy_token", token);
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("onegemmy_refresh_token");
}

export function setStoredRefreshToken(token: string) {
  if (typeof window !== "undefined") localStorage.setItem("onegemmy_refresh_token", token);
}

export function clearStoredTokens() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("onegemmy_token");
    localStorage.removeItem("onegemmy_refresh_token");
  }
}

async function tryRefreshToken(): Promise<string | null> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) return null;
    try {
      const res = await fetchWithTimeout(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }, REQUEST_TIMEOUT_MS);
      if (!res.ok) return null;
      const data = await res.json();
      const newToken = data?.data?.access_token;
      const newRefresh = data?.data?.refresh_token;
      if (newToken) setStoredToken(newToken);
      if (newRefresh) setStoredRefreshToken(newRefresh);
      return newToken ?? null;
    } catch {
      return null;
    } finally {
      _refreshPromise = null;
    }
  })();
  return _refreshPromise;
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetchWithTimeout(`${API_BASE}${path}`, { ...options, headers }, REQUEST_TIMEOUT_MS);

  // Auto-refresh on 401
  if (res.status === 401) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      const retryHeaders = { ...headers, "Authorization": `Bearer ${newToken}` };
      const retryRes = await fetchWithTimeout(`${API_BASE}${path}`, { ...options, headers: retryHeaders }, REQUEST_TIMEOUT_MS);
      if (retryRes.ok) return retryRes.json();
    }
    clearStoredTokens();
    _onSessionExpired?.();
    throw { status: 401, detail: "Session expired" };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = Array.isArray(body.detail)
      ? body.detail.map((e: { msg: string }) => e.msg).join(", ")
      : body.detail || body.message || res.statusText;
    throw { status: res.status, detail };
  }
  return res.json();
}

export { API_BASE };
