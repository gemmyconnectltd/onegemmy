"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  authApi,
  clearStoredTokens,
  clearApiCache,
  setStoredToken,
  setStoredRefreshToken,
  getStoredToken,
  getStoredRefreshToken,
  setSessionExpiredHandler,
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

// Backend permission resources (resource:action, see backend/app/scripts/seed.py)
// that grant access to each ERP module the sidebar/nav exposes.
const MODULE_RESOURCES: Record<string, string[]> = {
  sales: ["orders", "pos", "invoices"],
  inventory: ["items", "warehouses", "stock", "pricing", "returns"],
  accounting: [
    "invoices", "chart_of_accounts", "journal_entries", "accounts_payable",
    "accounts_receivable", "banking", "fixed_assets", "budgeting", "tax",
  ],
  procurement: ["vendors", "requisitions", "rfq", "purchase_orders", "goods_receipt", "contracts"],
  hr: ["employees", "organization", "recruitment", "attendance", "leave", "payroll", "performance"],
  customers: ["leads", "accounts", "contacts", "opportunities", "activities", "campaigns", "tickets"],
  manufacturing: ["bom", "routing", "mrp", "work_orders", "shop_floor", "quality", "costing"],
};

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
    permissions: u.permissions ?? [],
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
  const [sessionExpired, setSessionExpired] = useState(false);
  const router = useRouter();

  // Register session expired handler so API client can trigger it
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      clearApiCache();
      setSessionExpired(true);
    });
  }, []);
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
    const key = module.toLowerCase();
    const resources = MODULE_RESOURCES[key];
    if (!resources) return user.permissions.some((p) => p.startsWith(key + ":"));
    return user.permissions.some((p) => resources.some((r) => p.startsWith(r + ":")));
  }, [user]);

  const isSuperAdmin = useCallback((): boolean => user?.role === "superadmin" || (user?.isSuperuser ?? false), [user]);
  const isAdmin = useCallback((): boolean => user?.role === "admin" || isSuperAdmin(), [user, isSuperAdmin]);

  const value = useMemo(() => ({
    user, login, register, logout, isLoading,
    hasPermission, hasAnyPermission, hasModuleAccess,
    isSuperAdmin, isAdmin,
  }), [user, login, register, logout, isLoading, hasPermission, hasAnyPermission, hasModuleAccess, isSuperAdmin, isAdmin]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      {sessionExpired && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-foreground text-center">Session Expired</h2>
            <p className="text-sm text-muted text-center mt-1 mb-5">
              Your session has expired. Please log in again to continue.
            </p>
            <button
              onClick={() => {
                setSessionExpired(false);
                router.push("/login");
              }}
              className="w-full py-2.5 rounded-xl bg-accent hover:bg-accent/90 text-white text-sm font-semibold transition-colors"
            >
              Log in again
            </button>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
