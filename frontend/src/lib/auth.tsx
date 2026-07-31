"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { type Role } from "./roles";
import {
  authApi,
  clearStoredTokens,
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
  login: (email: string, password: string, tenantSlug?: string) => Promise<boolean>;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const tryRefresh = async () => {
      const refreshToken = getStoredRefreshToken();
      if (!refreshToken) { setIsLoading(false); return; }
      try {
        const res = await authApi.refresh(refreshToken);
        setStoredToken(res.data.access_token);
        setStoredRefreshToken(res.data.refresh_token);
        setUser(mapUser(res.data.user));
      } catch {
        clearStoredTokens();
      }
      setIsLoading(false);
    };
    tryRefresh();
  }, []);

  const login = useCallback(async (email: string, password: string, tenantSlug?: string): Promise<boolean> => {
    try {
      const res = await authApi.login(email, password, tenantSlug);
      setStoredToken(res.data.access_token);
      setStoredRefreshToken(res.data.refresh_token);
      setUser(mapUser(res.data.user));
      return true;
    } catch {
      return false;
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
