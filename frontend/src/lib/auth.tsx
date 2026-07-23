"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { permissions, type Role } from "./roles";
import { api, clearStoredToken, setStoredToken, getStoredToken, type ApiUserResponse } from "./api";

export interface User {
  id: string;
  email: string;
  name: string;
  platformRole: "super_admin" | "company_admin" | "user";
  roleId: string;
  companyId: string | null;
  shopId: string | null;
  avatar?: string;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "starter" | "professional" | "enterprise";
  createdAt: string;
}

export interface Shop {
  id: string;
  companyId: string;
  name: string;
  location: string;
  status: "active" | "inactive";
}

export interface AuthContextType {
  user: User | null;
  companies: Company[];
  shops: Shop[];
  roles: Role[];
  login: (email: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, password: string, company: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
  hasPermission: (permissionId: string) => boolean;
  hasAnyPermission: (permissionIds: string[]) => boolean;
  hasModuleAccess: (module: string) => boolean;
  isSuperAdmin: () => boolean;
  isAdmin: () => boolean;
  canManageUsers: () => boolean;
  canManageRoles: () => boolean;
  canManageCompany: () => boolean;
  getRole: () => Role | undefined;
  switchShop: (shopId: string) => void;
  switchCompany: (companyId: string) => void;
}

function mapUserFromApi(apiUser: ApiUserResponse): User {
  return {
    id: String(apiUser.id),
    email: apiUser.email,
    name: apiUser.name,
    platformRole: apiUser.platform_role as User["platformRole"],
    roleId: apiUser.role ? String(apiUser.role.id) : "",
    companyId: apiUser.company_id ? String(apiUser.company_id) : null,
    shopId: apiUser.shop_id ? String(apiUser.shop_id) : null,
  };
}

function mapRoleFromApi(apiUser: ApiUserResponse): Role | null {
  if (!apiUser.role) return null;
  return {
    id: String(apiUser.role.id),
    name: apiUser.role.name,
    description: apiUser.role.description || "",
    color: apiUser.role.color,
    permissions: apiUser.role.permissions,
    isSystem: apiUser.role.is_system,
  };
}

function mapCompanyFromApi(apiUser: ApiUserResponse): Company | null {
  if (!apiUser.company) return null;
  return {
    id: String(apiUser.company.id),
    name: apiUser.company.name,
    slug: apiUser.company.slug,
    plan: apiUser.company.plan as Company["plan"],
    createdAt: "",
  };
}

function mapShopFromApi(apiUser: ApiUserResponse): Shop | null {
  if (!apiUser.shop) return null;
  return {
    id: String(apiUser.shop.id),
    companyId: String(apiUser.shop.company_id),
    name: apiUser.shop.name,
    location: apiUser.shop.location,
    status: apiUser.shop.status as Shop["status"],
  };
}

const SUPER_ADMIN_ROLE: Role = {
  id: "super_admin",
  name: "Super Admin",
  description: "Platform superadmin.",
  color: "#dc2626",
  permissions: permissions.map((p) => p.id),
  isSystem: true,
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadUserFromToken = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const apiUser = await api.auth.me();
      const mappedUser = mapUserFromApi(apiUser);
      setUser(mappedUser);
      if (apiUser.platform_role === "super_admin") {
        setRoles([SUPER_ADMIN_ROLE]);
        setUserPermissions(SUPER_ADMIN_ROLE.permissions);
      } else if (apiUser.role) {
        const role = mapRoleFromApi(apiUser);
        if (role) {
          setRoles([role]);
          setUserPermissions(role.permissions);
        }
      }
      const company = mapCompanyFromApi(apiUser);
      if (company) setCompanies([company]);
      const shop = mapShopFromApi(apiUser);
      if (shop) setShops([shop]);
    } catch {
      clearStoredToken();
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadUserFromToken();
  }, [loadUserFromToken]);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      const { access_token } = await api.auth.login(email, password);
      setStoredToken(access_token);
      const apiUser = await api.auth.me();
      const mappedUser = mapUserFromApi(apiUser);
      setUser(mappedUser);
      if (apiUser.platform_role === "super_admin") {
        setRoles([SUPER_ADMIN_ROLE]);
        setUserPermissions(SUPER_ADMIN_ROLE.permissions);
      } else if (apiUser.role) {
        const role = mapRoleFromApi(apiUser);
        if (role) {
          setRoles([role]);
          setUserPermissions(role.permissions);
        }
      }
      const company = mapCompanyFromApi(apiUser);
      if (company) setCompanies([company]);
      const shop = mapShopFromApi(apiUser);
      if (shop) setShops([shop]);
      return true;
    } catch {
      return false;
    }
  }, []);

  const register = useCallback(async (name: string, email: string, password: string, companyName: string): Promise<boolean> => {
    try {
      const { access_token } = await api.auth.register(name, email, password, companyName);
      setStoredToken(access_token);
      const apiUser = await api.auth.me();
      const mappedUser = mapUserFromApi(apiUser);
      setUser(mappedUser);
      if (apiUser.platform_role === "super_admin") {
        setRoles([SUPER_ADMIN_ROLE]);
        setUserPermissions(SUPER_ADMIN_ROLE.permissions);
      } else if (apiUser.role) {
        const role = mapRoleFromApi(apiUser);
        if (role) {
          setRoles([role]);
          setUserPermissions(role.permissions);
        }
      }
      const company = mapCompanyFromApi(apiUser);
      if (company) setCompanies([company]);
      const shop = mapShopFromApi(apiUser);
      if (shop) setShops([shop]);
      return true;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setCompanies([]);
    setShops([]);
    setRoles([]);
    setUserPermissions([]);
    clearStoredToken();
  }, []);

  const getRole = useCallback((): Role | undefined => {
    if (!user) return undefined;
    if (user.platformRole === "super_admin") return SUPER_ADMIN_ROLE;
    return roles.find((r) => r.id === user.roleId);
  }, [user, roles]);

  const hasPermission = useCallback((permissionId: string): boolean => {
    if (!user) return false;
    if (user.platformRole === "super_admin") return true;
    return userPermissions.includes(permissionId);
  }, [user, userPermissions]);

  const hasAnyPermission = useCallback((permissionIds: string[]): boolean => {
    return permissionIds.some((id) => hasPermission(id));
  }, [hasPermission]);

  const hasModuleAccess = useCallback((module: string): boolean => {
    if (!user) return false;
    if (user.platformRole === "super_admin") return true;
    return userPermissions.some((p) => p.startsWith(module.toLowerCase() + "."));
  }, [user, userPermissions]);

  const isSuperAdmin = useCallback((): boolean => user?.platformRole === "super_admin", [user]);
  const isAdmin = useCallback((): boolean => user?.platformRole === "company_admin" || user?.platformRole === "super_admin", [user]);
  const canManageUsers = useCallback((): boolean => hasPermission("settings.users.manage") || isAdmin(), [hasPermission, isAdmin]);
  const canManageRoles = useCallback((): boolean => hasPermission("settings.roles.manage"), [hasPermission]);
  const canManageCompany = useCallback((): boolean => {
    if (!user) return false;
    return user.platformRole === "super_admin" || user.platformRole === "company_admin";
  }, [user]);

  const switchShop = useCallback((shopId: string) => {
    if (!user) return;
    const updated = { ...user, shopId };
    setUser(updated);
  }, [user]);

  const switchCompany = useCallback((companyId: string) => {
    if (!user) return;
    const updated = { ...user, companyId, shopId: null };
    setUser(updated);
  }, [user]);

  const value = useMemo(() => ({
    user,
    companies,
    shops,
    roles,
    login,
    register,
    logout,
    isLoading,
    hasPermission,
    hasAnyPermission,
    hasModuleAccess,
    isSuperAdmin,
    isAdmin,
    canManageUsers,
    canManageRoles,
    canManageCompany,
    getRole,
    switchShop,
    switchCompany,
  }), [
    user, companies, shops, roles, isLoading,
    login, register, logout,
    hasPermission, hasAnyPermission, hasModuleAccess,
    isSuperAdmin, isAdmin, canManageUsers, canManageRoles, canManageCompany,
    getRole, switchShop, switchCompany,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
