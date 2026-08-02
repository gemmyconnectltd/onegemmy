const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://onegemmy.onrender.com/api/v1";

// ── In-memory GET cache ──────────────────────────────────────────────────────
// The API is served from a separate host (Render) with real network latency,
// and many pages fetch overlapping data (dashboard, reports, POS catalog...).
// Cache GET responses briefly so navigating back and forth feels instant,
// while keeping a short TTL so data stays fresh. Any mutation (POST/PUT/PATCH/
// DELETE) clears the whole cache so nothing ever shows stale data.

const CACHE_TTL_MS = 20_000;
const MAX_CACHE_ENTRIES = 200;
const getCache = new Map<string, { expires: number; data: unknown }>();

function pruneCache() {
  if (getCache.size <= MAX_CACHE_ENTRIES) return;
  const oldest = getCache.keys().next().value;
  if (oldest !== undefined) getCache.delete(oldest);
}

export function clearApiCache() {
  getCache.clear();
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

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const cacheKey = `${method} ${path}`;

  if (method === "GET") {
    const hit = getCache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return hit.data as T;
  }

  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = Array.isArray(body.detail)
      ? body.detail.map((e: { msg: string }) => e.msg).join(", ")
      : body.detail || body.message || res.statusText;
    throw { status: res.status, detail };
  }
  const data = await res.json();

  if (method === "GET") {
    getCache.set(cacheKey, { data, expires: Date.now() + CACHE_TTL_MS });
    pruneCache();
  } else {
    // Mutations invalidate all cached reads so nothing goes stale.
    getCache.clear();
  }
  return data;
}

export { API_BASE };
