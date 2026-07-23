"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, password: string, company: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEMO_USERS = [
  { id: "1", email: "admin@onegemmy.com", name: "Admin User", password: "admin123", role: "Owner" },
  { id: "2", email: "manager@onegemmy.com", name: "Manager User", password: "manager123", role: "Manager" },
  { id: "3", email: "sales@onegemmy.com", name: "Sales User", password: "sales123", role: "Sales Rep" },
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
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

  const login = async (email: string, password: string): Promise<boolean> => {
    const found = DEMO_USERS.find((u) => u.email === email && u.password === password);
    if (found) {
      const userData = { id: found.id, email: found.email, name: found.name, role: found.role };
      setUser(userData);
      localStorage.setItem("onegemmy_user", JSON.stringify(userData));
      return true;
    }
    return false;
  };

  const register = async (name: string, email: string, password: string, company: string): Promise<boolean> => {
    const exists = DEMO_USERS.find((u) => u.email === email);
    if (exists) return false;

    const newUser = {
      id: String(DEMO_USERS.length + 1),
      email,
      name,
      role: "Owner",
    };
    DEMO_USERS.push({ ...newUser, password, company } as any);
    setUser(newUser);
    localStorage.setItem("onegemmy_user", JSON.stringify(newUser));
    return true;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("onegemmy_user");
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
