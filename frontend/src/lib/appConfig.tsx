"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import {
  currencies, locales, businessTypes, businessThemes, businessThemesDark,
  type LocaleCode, type BusinessType, type Theme,
} from "./config";

// All English base strings — single source of truth
const BASE_STRINGS: Record<string, string> = {
  dashboard: "Dashboard", sales: "Sales", inventory: "Inventory",
  finance: "Finance", procurement: "Procurement", hr: "HR",
  customers: "Customers", crm: "CRM", manufacturing: "Mfg",
  reports: "Reports", settings: "Settings", overview: "Overview",
  orders: "Orders", targets: "Targets", returns: "Returns",
  analytics: "Analytics", income: "Income", expenses: "Expenses",
  accounts: "Accounts", invoices: "Invoices", employees: "Employees", recruiting: "Recruiting",
  attendance: "Attendance", payroll: "Payroll", leave: "Leave",
  contacts: "Contacts", campaigns: "Campaigns", emails: "Emails",
  suppliers: "Suppliers", requests: "Requests", workOrders: "Work Orders",
  bom: "Bill of Materials", materials: "Materials", loyalty: "Loyalty",
  segments: "Segments", products: "Products", categories: "Categories",
  brands: "Brands", units: "Units", general: "General",
  usersRoles: "Users & Roles", notifications: "Notifications",
  security: "Security", appearance: "Appearance", allCustomers: "All Customers",
  signOut: "Sign out", language: "Language", currency: "Currency",
  search: "Search", filter: "Filter", newDeal: "New Deal",
  pos: "Point of Sale", collapse: "Collapse",
};

const LOCALE_LANG_MAP: Record<LocaleCode, string> = {
  en: "en",
  rw: "rw",
  sw: "sw",
};

const VALID_LOCALES: LocaleCode[] = ["en", "rw", "sw"];
const VALID_BUSINESS_TYPES: BusinessType[] = ["retail", "restaurant", "service"];
export type NavOrientation = "top" | "left";
const VALID_ORIENTATIONS: NavOrientation[] = ["top", "left"];

async function fetchTranslations(targetLang: string): Promise<Record<string, string>> {
  const cacheKey = `translations_${targetLang}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return JSON.parse(cached);

  const keys = Object.keys(BASE_STRINGS);
  const texts = Object.values(BASE_STRINGS);

  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts, targetLang }),
    });

    if (!res.ok) throw new Error("Translation API failed");

    const { translated } = await res.json() as { translated: string[] };

    const result: Record<string, string> = {};
    keys.forEach((key, i) => { result[key] = translated[i] ?? BASE_STRINGS[key]; });

    localStorage.setItem(cacheKey, JSON.stringify(result));
    return result;
  } catch {
    // Fallback to English on error
    return BASE_STRINGS;
  }
}

function getStored(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(key) ?? fallback;
}

function applyTheme(type: BusinessType, theme: Theme) {
  const palette = theme === "dark" ? businessThemesDark[type] : businessThemes[type];
  const root = document.documentElement;
  root.style.setProperty("--background", palette.background);
  root.style.setProperty("--surface", palette.surface);
  root.style.setProperty("--border", palette.border);
  root.style.setProperty("--accent", palette.accent);
  root.style.setProperty("--primary", palette.primary);
  root.style.setProperty("--foreground", palette.foreground);
  root.style.setProperty("--muted", palette.muted);
}

interface AppConfig {
  currency: string;
  currencySymbol: string;
  locale: LocaleCode;
  businessType: BusinessType;
  theme: Theme;
  navOrientation: NavOrientation;
  translating: boolean;
  t: (key: string) => string;
  setCurrency: (code: string) => void;
  setLocale: (code: LocaleCode) => void;
  setBusinessType: (type: BusinessType) => void;
  setTheme: (theme: Theme) => void;
  setNavOrientation: (orientation: NavOrientation) => void;
  currencies: typeof currencies;
  locales: typeof locales;
  businessTypes: typeof businessTypes;
}

const AppConfigContext = createContext<AppConfig | null>(null);

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState(() => getStored("app_currency", "RWF"));
  const [locale, setLocaleState] = useState<LocaleCode>(() => {
    const l = getStored("app_locale", "en");
    return (VALID_LOCALES.includes(l as LocaleCode) ? l : "en") as LocaleCode;
  });
  const [businessType, setBusinessTypeState] = useState<BusinessType>(() => {
    const b = getStored("app_business_type", "retail");
    return (VALID_BUSINESS_TYPES.includes(b as BusinessType) ? b : "retail") as BusinessType;
  });
  const [theme, setThemeState] = useState<Theme>(() => {
    const t = getStored("app_theme", "light");
    return t === "dark" ? "dark" : "light";
  });
  const [navOrientation, setNavOrientationState] = useState<NavOrientation>(() => {
    const o = getStored("app_nav_orientation", "left");
    return (VALID_ORIENTATIONS.includes(o as NavOrientation) ? o : "left") as NavOrientation;
  });
  const [strings, setStrings] = useState<Record<string, string>>(BASE_STRINGS);
  const [translating, setTranslating] = useState(false);

  const loadTranslations = useCallback(async (loc: LocaleCode) => {
    if (loc === "en") {
      setStrings(BASE_STRINGS);
      return;
    }
    setTranslating(true);
    const result = await fetchTranslations(LOCALE_LANG_MAP[loc]);
    setStrings(result);
    setTranslating(false);
  }, []);

  // Apply the theme palette (DOM side effects only — no setState).
  useEffect(() => {
    applyTheme(businessType, theme);
  }, [businessType, theme]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Load translations after mount (deferred so no synchronous setState in effect).
  useEffect(() => {
    const id = window.setTimeout(() => { loadTranslations(locale); }, 0);
    return () => window.clearTimeout(id);
  }, [locale, loadTranslations]);

  const setCurrency = (code: string) => {
    setCurrencyState(code);
    localStorage.setItem("app_currency", code);
  };

  const setLocale = (code: LocaleCode) => {
    setLocaleState(code);
    localStorage.setItem("app_locale", code);
  };

  const setBusinessType = (type: BusinessType) => {
    setBusinessTypeState(type);
    localStorage.setItem("app_business_type", type);
  };

  const setTheme = (next: Theme) => {
    setThemeState(next);
    localStorage.setItem("app_theme", next);
  };

  const setNavOrientation = (next: NavOrientation) => {
    setNavOrientationState(next);
    localStorage.setItem("app_nav_orientation", next);
  };

  const currencySymbol = currencies.find((c) => c.code === currency)?.symbol ?? currency;
  const t = (key: string) => strings[key] ?? BASE_STRINGS[key] ?? key;

  return (
    <AppConfigContext.Provider value={{
      currency, currencySymbol, locale, businessType, theme, navOrientation, translating,
      t, setCurrency, setLocale, setBusinessType, setTheme, setNavOrientation,
      currencies, locales, businessTypes,
    }}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  const ctx = useContext(AppConfigContext);
  if (!ctx) throw new Error("useAppConfig must be used within AppConfigProvider");
  return ctx;
}
