"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import {
  authApi, clearStoredTokens, clearApiCache, setStoredToken, setStoredRefreshToken, getStoredToken, getStoredRefreshToken,
  setSessionExpiredHandler, type ApiTokenUserInfo,
} from "./api";

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  isSuperuser: boolean;
  tenantId: string | null;
}

/**
 * The ONLY accounts this portal accepts: platform super admins. Mirrors the backend rule
 * (`is_superuser`, no tenant, role "superadmin") — a tenant owner is also `is_superuser` inside their own business,
 * so `is_superuser` alone is never enough. The backend enforces this on every request; this check just keeps
 * everyone else from ever holding a session here.
 */
export function isPlatformAdmin(u: { role: string; isSuperuser: boolean; tenantId: string | null } | null | undefined): boolean {
  return !!u && u.isSuperuser && u.tenantId === null && u.role === "superadmin";
}

/** Pesaa's support team (Support Manager / Support Agent): platform users with no tenant. They may use ONLY the
 *  Customer Support area of this portal; the backend enforces that too. */
export function isSupportStaff(u: { role: string; tenantId: string | null } | null | undefined): boolean {
  return !!u && u.tenantId === null && (u.role === "support_manager" || u.role === "support_agent");
}

function mapUser(u: ApiTokenUserInfo): User {
  return { id: u.id, email: u.email, name: u.full_name, role: u.role, isSuperuser: u.is_superuser, tenantId: u.tenant_id };
}

function decodeToken(token: string): (ApiTokenUserInfo & { exp?: number }) | null {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const payload = decodeToken(token);
  if (!payload?.exp) return true;
  return Date.now() / 1000 > payload.exp;
}

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  isSuperAdmin: () => boolean;
  /** A support manager/agent: allowed in, but only into /support. */
  isSupportOnly: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // The API client calls this when a refresh fails: drop the session, the portal layout sends you to /login.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      clearApiCache();
    });
  }, []);

  // Restore the session after mount (never read storage during render — hydration safety).
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const token = getStoredToken();
      if (token && !isTokenExpired(token)) {
        const payload = decodeToken(token);
        if (payload) {
          const u = mapUser(payload);
          if (isPlatformAdmin(u) || isSupportStaff(u)) {
            if (!cancelled) { setUser(u); setIsLoading(false); }
            return;
          }
          clearStoredTokens();     // a non-admin token must never survive here
        }
      }
      const refreshToken = getStoredRefreshToken();
      if (!refreshToken) { if (!cancelled) setIsLoading(false); return; }
      try {
        const res = await authApi.refresh(refreshToken);
        const u = mapUser(res.data.user);
        if (isPlatformAdmin(u) || isSupportStaff(u)) {
          setStoredToken(res.data.access_token);
          setStoredRefreshToken(res.data.refresh_token);
          if (!cancelled) setUser(u);
        } else {
          clearStoredTokens();
        }
      } catch {
        clearStoredTokens();
      }
      if (!cancelled) setIsLoading(false);
    };
    void init();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string, rememberMe = false) => {
    try {
      const res = await authApi.login(email, password);
      const u = mapUser(res.data.user);
      if (!isPlatformAdmin(u) && !isSupportStaff(u)) {
        // A valid customer account, but not a platform admin: never store its tokens on this origin.
        return { ok: false, error: "This portal is for Pesaa platform administrators and support staff only." };
      }
      setStoredToken(res.data.access_token, rememberMe);
      setStoredRefreshToken(res.data.refresh_token, rememberMe);
      setUser(u);
      return { ok: true };
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const detail = (err as { detail?: string })?.detail;
      if (!status) return { ok: false, error: "Can't reach the server. Check your connection and try again." };
      if (status === 401) return { ok: false, error: "Invalid email or password" };
      if (status === 429) return { ok: false, error: "Too many attempts. Please wait a moment and try again." };
      return { ok: false, error: detail || "Sign in failed. Please try again." };
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    clearStoredTokens();
    clearApiCache();
  }, []);

  const isSuperAdmin = useCallback(() => isPlatformAdmin(user), [user]);
  const isSupportOnly = useCallback(() => isSupportStaff(user), [user]);

  const value = useMemo(() => ({ user, isLoading, login, logout, isSuperAdmin, isSupportOnly }), [user, isLoading, login, logout, isSuperAdmin, isSupportOnly]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
