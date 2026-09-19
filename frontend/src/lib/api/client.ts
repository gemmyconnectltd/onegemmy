import { clearApiQueryCache } from "./queryClient";

// The backend now runs on a VPS, not Render — there's no fixed production
// URL to fall back to here. NEXT_PUBLIC_API_URL must be set explicitly for
// any real deployment; this default only covers local dev.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

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

// "Remember me" decides where tokens live: localStorage survives browser
// restarts, sessionStorage clears when the tab/browser closes. Reads check
// sessionStorage first so an unremembered session takes priority if both
// happen to be set. Writes with no explicit `remember` (e.g. token refresh)
// reuse whichever storage already holds the token, preserving the choice
// made at login.
function activeStorage(key: string): Storage {
  if (typeof window === "undefined") return localStorage;
  return sessionStorage.getItem(key) !== null ? sessionStorage : localStorage;
}

function setStored(key: string, value: string, remember?: boolean) {
  if (typeof window === "undefined") return;
  const storage = remember === undefined ? activeStorage(key) : remember ? localStorage : sessionStorage;
  const other = storage === localStorage ? sessionStorage : localStorage;
  other.removeItem(key);
  storage.setItem(key, value);
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("onegemmy_token") ?? localStorage.getItem("onegemmy_token");
}

export function setStoredToken(token: string, remember?: boolean) {
  setStored("onegemmy_token", token, remember);
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("onegemmy_refresh_token") ?? localStorage.getItem("onegemmy_refresh_token");
}

export function setStoredRefreshToken(token: string, remember?: boolean) {
  setStored("onegemmy_refresh_token", token, remember);
}

export function clearStoredTokens() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("onegemmy_token");
    localStorage.removeItem("onegemmy_refresh_token");
    sessionStorage.removeItem("onegemmy_token");
    sessionStorage.removeItem("onegemmy_refresh_token");
  }
}

async function tryRefreshToken(): Promise<string | null> {
  // Deduplicate concurrent refresh calls
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

// A 401 from these means "wrong credentials" / "expired reset link", not
// "your session died" — they're the entry points to a session, not calls
// made during one, so they must never trigger the refresh-then-session-
// expired flow below (that flow assumes an existing session went stale).
const PUBLIC_AUTH_PATHS = ["/auth/login", "/auth/token", "/auth/register", "/auth/refresh", "/auth/forgot-password", "/auth/reset-password", "/auth/change-password"];

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetchWithTimeout(`${API_BASE}${path}`, { ...options, headers }, REQUEST_TIMEOUT_MS);

  // Auto-refresh on 401
  if (res.status === 401 && !PUBLIC_AUTH_PATHS.some((p) => path.startsWith(p))) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      // Retry original request with new token
      const retryHeaders = { ...headers, "Authorization": `Bearer ${newToken}` };
      const retryRes = await fetchWithTimeout(`${API_BASE}${path}`, { ...options, headers: retryHeaders }, REQUEST_TIMEOUT_MS);
      if (retryRes.ok) return retryRes.json();
    }
    // Refresh failed — session expired
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

/** Backend origin, derived from API_BASE (which includes the `/api/v1` path). */
const API_ORIGIN = API_BASE.replace(/\/api\/v1\/?$/, "");

/** Resolves a backend-relative upload path (e.g. "/uploads/logos/x.png") to an
 *  absolute URL. Already-absolute URLs and null/empty values pass through. */
export function resolveUploadUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path}`;
}

export { API_BASE };
