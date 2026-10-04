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

// Only meaningful for a user with no fixed branch of their own (an
// Admin/Owner — see User.branchId) — it's how they pick which branch a
// POS sale or other branch-scoped write applies to. For a user who does
// have a fixed branch, the backend ignores this header entirely and
// always uses their own branch, so it's harmless to leave unset for them.
export function getActiveBranchId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("onegemmy_active_branch_id");
}

export function setActiveBranchId(branchId: string | null) {
  if (typeof window === "undefined") return;
  if (branchId) localStorage.setItem("onegemmy_active_branch_id", branchId);
  else localStorage.removeItem("onegemmy_active_branch_id");
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
  const activeBranchId = getActiveBranchId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (activeBranchId) headers["X-Branch-Id"] = activeBranchId;

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

function _triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function _filenameFromDisposition(res: Response, fallback: string): string {
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return match ? decodeURIComponent(match[1]) : fallback;
}

/** Fetches a binary endpoint (e.g. a generated PDF) and triggers a browser
 *  download — for responses that aren't JSON, so they can't go through
 *  `request()`. Reads the server's Content-Disposition filename when present,
 *  falling back to `fallbackFilename`. */
export async function downloadFile(path: string, fallbackFilename: string): Promise<void> {
  const token = getStoredToken();
  const activeBranchId = getActiveBranchId();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (activeBranchId) headers["X-Branch-Id"] = activeBranchId;

  const res = await fetchWithTimeout(`${API_BASE}${path}`, { headers }, REQUEST_TIMEOUT_MS);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw { status: res.status, detail: body.detail || body.message || res.statusText };
  }

  _triggerDownload(await res.blob(), _filenameFromDisposition(res, fallbackFilename));
}

/** Same as `downloadFile`, but POSTs a JSON body — for exports driven by a
 *  filter/options payload too large or structured for a query string. */
export async function downloadFilePost(path: string, body: object, fallbackFilename: string): Promise<void> {
  const token = getStoredToken();
  const activeBranchId = getActiveBranchId();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (activeBranchId) headers["X-Branch-Id"] = activeBranchId;

  const res = await fetchWithTimeout(
    `${API_BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) }, REQUEST_TIMEOUT_MS,
  );
  if (!res.ok) {
    const resBody = await res.json().catch(() => ({ detail: res.statusText }));
    throw { status: res.status, detail: resBody.detail || resBody.message || res.statusText };
  }

  _triggerDownload(await res.blob(), _filenameFromDisposition(res, fallbackFilename));
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

/** Builds a "?a=1&b=2" query string, dropping undefined/empty values. Shared
 *  by every paginated list endpoint so page/pageSize/search/status params are
 *  built the same way everywhere. */
export function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") search.set(k, String(v));
  });
  const s = search.toString();
  return s ? `?${s}` : "";
}

export { API_BASE };
