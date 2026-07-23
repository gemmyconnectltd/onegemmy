"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { defaultRoles, permissions, type Role } from "./roles";

// --- Types ---

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

// --- Demo Data ---

const DEMO_USERS: (User & { password: string })[] = [
  {
    id: "1",
    email: "super@onegemmy.com",
    name: "Super Admin",
    password: "super123",
    platformRole: "super_admin",
    roleId: "super_admin",
    companyId: null,
    shopId: null,
  },
  {
    id: "2",
    email: "admin@onegemmy.com",
    name: "Company Admin",
    password: "admin123",
    platformRole: "company_admin",
    roleId: "owner",
    companyId: "c1",
    shopId: null,
  },
  {
    id: "3",
    email: "manager@onegemmy.com",
    name: "Shop Manager",
    password: "manager123",
    platformRole: "user",
    roleId: "manager",
    companyId: "c1",
    shopId: "s1",
  },
  {
    id: "4",
    email: "sales@onegemmy.com",
    name: "Sales Rep",
    password: "sales123",
    platformRole: "user",
    roleId: "sales_rep",
    companyId: "c1",
    shopId: "s1",
  },
  {
    id: "5",
    email: "staff@onegemmy.com",
    name: "Shop Staff",
    password: "staff123",
    platformRole: "user",
    roleId: "employee",
    companyId: "c1",
    shopId: "s1",
  },
];

const DEMO_COMPANIES: Company[] = [
  { id: "c1", name: "Gemmy Connect Ltd", slug: "gemmy-connect", plan: "professional", createdAt: "2024-01-15" },
  { id: "c2", name: "Acme Corp", slug: "acme-corp", plan: "enterprise", createdAt: "2024-03-20" },
  { id: "c3", name: "Rwanda Tech Hub", slug: "rwanda-tech", plan: "starter", createdAt: "2024-06-10" },
];

const DEMO_SHOPS: Shop[] = [
  { id: "s1", companyId: "c1", name: "Kigali Main Store", location: "Kigali, Rwanda", status: "active" },
  { id: "s2", companyId: "c1", name: "Nyamirambo Branch", location: "Nyamirambo, Kigali", status: "active" },
  { id: "s3", companyId: "c1", name: "Huye Store", location: "Huye, Rwanda", status: "inactive" },
  { id: "s4", companyId: "c2", name: "Downtown Office", location: "Nairobi, Kenya", status: "active" },
];

// --- Super Admin Role (platform-level) ---

const SUPER_ADMIN_ROLE: Role = {
  id: "super_admin",
  name: "Super Admin",
  description: "Platform superadmin. Manages all companies and users across the entire platform.",
  color: "#dc2626",
  permissions: permissions.map((p) => p.id),
  isSystem: true,
};

// --- Context ---

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<Company[]>(DEMO_COMPANIES);
  const [shops, setShops] = useState<Shop[]>(DEMO_SHOPS);
  const [roles, setRoles] = useState<Role[]>([SUPER_ADMIN_ROLE, ...defaultRoles]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("onegemmy_user");
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {}
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    const found = DEMO_USERS.find((u) => u.email === email && u.password === password);
    if (found) {
      const userData: User = {
        id: found.id,
        email: found.email,
        name: found.name,
        platformRole: found.platformRole,
        roleId: found.roleId,
        companyId: found.companyId,
        shopId: found.shopId,
      };
      setUser(userData);
      localStorage.setItem("onegemmy_user", JSON.stringify(userData));
      return true;
    }
    return false;
  }, []);

  const register = useCallback(async (name: string, email: string, password: string, companyName: string): Promise<boolean> => {
    const exists = DEMO_USERS.find((u) => u.email === email);
    if (exists) return false;

    const companyId = "c" + Date.now();
    const shopId = "s" + Date.now();

    const newCompany: Company = {
      id: companyId,
      name: companyName,
      slug: companyName.toLowerCase().replace(/\s+/g, "-"),
      plan: "free",
      createdAt: new Date().toISOString(),
    };

    const newShop: Shop = {
      id: shopId,
      companyId,
      name: companyName + " - Main",
      location: "",
      status: "active",
    };

    const newUser: User = {
      id: String(DEMO_USERS.length + 1),
      email,
      name,
      platformRole: "company_admin",
      roleId: "owner",
      companyId,
      shopId,
    };

    DEMO_USERS.push({ ...newUser, password });
    setCompanies((prev) => [...prev, newCompany]);
    setShops((prev) => [...prev, newShop]);
    setUser(newUser);
    localStorage.setItem("onegemmy_user", JSON.stringify(newUser));
    return true;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem("onegemmy_user");
  }, []);

  // --- Permission checks ---

  const getRole = useCallback((): Role | undefined => {
    if (!user) return undefined;
    if (user.platformRole === "super_admin") return SUPER_ADMIN_ROLE;
    return roles.find((r) => r.id === user.roleId);
  }, [user, roles]);

  const hasPermission = useCallback((permissionId: string): boolean => {
    if (!user) return false;
    if (user.platformRole === "super_admin") return true;
    const role = roles.find((r) => r.id === user.roleId);
    return role?.permissions.includes(permissionId) ?? false;
  }, [user, roles]);

  const hasAnyPermission = useCallback((permissionIds: string[]): boolean => {
    return permissionIds.some((id) => hasPermission(id));
  }, [hasPermission]);

  const hasModuleAccess = useCallback((module: string): boolean => {
    if (!user) return false;
    if (user.platformRole === "super_admin") return true;
    const role = roles.find((r) => r.id === user.roleId);
    return role?.permissions.some((p) => p.startsWith(module.toLowerCase() + ".")) ?? false;
  }, [user, roles]);

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
    localStorage.setItem("onegemmy_user", JSON.stringify(updated));
  }, [user]);

  const switchCompany = useCallback((companyId: string) => {
    if (!user) return;
    const updated = { ...user, companyId, shopId: null };
    setUser(updated);
    localStorage.setItem("onegemmy_user", JSON.stringify(updated));
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
