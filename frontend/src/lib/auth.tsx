"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import {
  authApi,
  clearStoredTokens,
  clearApiCache,
  setStoredToken,
  setStoredRefreshToken,
  getStoredToken,
  getStoredRefreshToken,
  type ApiTokenUserInfo,
} from "./api";

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  roleId: string | null;
  isSuperuser: boolean;
  tenantId: string | null;
  tenantName: string | null;
  tenantSlug: string | null;
  permissions: string[];
}

export interface AuthContextType {
  user: User | null;
  login: (email: string, password: string, tenantSlug?: string) => Promise<{ ok: boolean; error?: string }>;
  register: (data: { tenantName: string; tenantSlug: string; email: string; password: string; fullName: string }) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasModuleAccess: (module: string) => boolean;
  isSuperAdmin: () => boolean;
  isAdmin: () => boolean;
}

function mapUser(u: ApiTokenUserInfo): User {
  return {
    id: u.id,
    email: u.email,
    name: u.full_name,
    role: u.role,
    roleId: u.role_id,
    isSuperuser: u.is_superuser,
    tenantId: u.tenant_id,
    tenantName: u.tenant_name,
    tenantSlug: u.tenant_slug,
    permissions: u.permissions,
  };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function decodeToken(token: string): (ApiTokenUserInfo & { exp?: number }) | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const payload = decodeToken(token);
  if (!payload?.exp) return true;
  return Date.now() / 1000 > payload.exp;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const token = getStoredToken();
      if (token && !isTokenExpired(token)) {
        const payload = decodeToken(token);
        if (payload) {
          if (!cancelled) setUser(mapUser(payload));
          if (!cancelled) setIsLoading(false);
          return;
        }
      }
      const refreshToken = getStoredRefreshToken();
      if (!refreshToken) {
        if (!cancelled) setIsLoading(false);
        return;
      }
      try {
        const res = await authApi.refresh(refreshToken);
        setStoredToken(res.data.access_token);
        setStoredRefreshToken(res.data.refresh_token);
        if (!cancelled) setUser(mapUser(res.data.user));
      } catch {
        clearStoredTokens();
      }
      if (!cancelled) setIsLoading(false);
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string, tenantSlug?: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await authApi.login(email, password, tenantSlug);
      setStoredToken(res.data.access_token);
      setStoredRefreshToken(res.data.refresh_token);
      setUser(mapUser(res.data.user));
      return { ok: true };
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const detail = (err as { detail?: string })?.detail;
      if (!status) {
        return { ok: false, error: "Can't reach the server. Check your connection and try again in a moment." };
      }
      if (status === 401) {
        return { ok: false, error: "Invalid email or password" };
      }
      return { ok: false, error: detail || "Login failed. Please try again." };
    }
  }, []);

  const register = useCallback(async (data: { tenantName: string; tenantSlug: string; email: string; password: string; fullName: string }): Promise<boolean> => {
    try {
      const res = await authApi.register({
        tenant_name: data.tenantName,
        tenant_slug: data.tenantSlug,
        email: data.email,
        password: data.password,
        full_name: data.fullName,
      });
      setStoredToken(res.data.access_token);
      setStoredRefreshToken(res.data.refresh_token);
      setUser(mapUser(res.data.user));
      return true;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    clearStoredTokens();
    // Drop cached API responses so the next session never sees stale data
    // from the previous user (logout makes no network request).
    clearApiCache();
  }, []);

  const hasPermission = useCallback((permission: string): boolean => {
    if (!user) return false;
    if (user.isSuperuser) return true;
    return user.permissions.includes(permission);
  }, [user]);

  const hasAnyPermission = useCallback((perms: string[]): boolean => {
    return perms.some((p) => hasPermission(p));
  }, [hasPermission]);

  const hasModuleAccess = useCallback((module: string): boolean => {
    if (!user) return false;
    if (user.isSuperuser) return true;
    return user.permissions.some((p) => p.startsWith(module.toLowerCase() + ":"));
  }, [user]);

  const isSuperAdmin = useCallback((): boolean => user?.role === "superadmin" || (user?.isSuperuser ?? false), [user]);
  const isAdmin = useCallback((): boolean => user?.role === "admin" || isSuperAdmin(), [user, isSuperAdmin]);

  const value = useMemo(() => ({
    user, login, register, logout, isLoading,
    hasPermission, hasAnyPermission, hasModuleAccess,
    isSuperAdmin, isAdmin,
  }), [user, login, register, logout, isLoading, hasPermission, hasAnyPermission, hasModuleAccess, isSuperAdmin, isAdmin]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
