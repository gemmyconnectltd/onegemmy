const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://onegemmy.onrender.com/api/v1";

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
  return res.json();
}

export { API_BASE };
