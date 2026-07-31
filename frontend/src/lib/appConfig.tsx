"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { currencies, locales, businessTypes, businessThemes, type LocaleCode, type BusinessType } from "./config";

// All English base strings — single source of truth
const BASE_STRINGS: Record<string, string> = {
  dashboard: "Dashboard", sales: "Sales", inventory: "Inventory",
  finance: "Finance", procurement: "Procurement", hr: "HR",
  customers: "Customers", crm: "CRM", manufacturing: "Mfg",
  reports: "Reports", settings: "Settings", overview: "Overview",
  orders: "Orders", targets: "Targets", returns: "Returns",
  analytics: "Analytics", income: "Income", expenses: "Expenses",
  accounts: "Accounts", employees: "Employees", recruiting: "Recruiting",
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

function applyTheme(type: BusinessType) {
  const theme = businessThemes[type];
  const root = document.documentElement;
  root.style.setProperty("--background", theme.background);
  root.style.setProperty("--surface", theme.surface);
  root.style.setProperty("--border", theme.border);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--foreground", theme.foreground);
  root.style.setProperty("--muted", theme.muted);
}

interface AppConfig {
  currency: string;
  currencySymbol: string;
  locale: LocaleCode;
  businessType: BusinessType;
  translating: boolean;
  t: (key: string) => string;
  setCurrency: (code: string) => void;
  setLocale: (code: LocaleCode) => void;
  setBusinessType: (type: BusinessType) => void;
  currencies: typeof currencies;
  locales: typeof locales;
  businessTypes: typeof businessTypes;
}

const AppConfigContext = createContext<AppConfig | null>(null);

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState("RWF");
  const [locale, setLocaleState] = useState<LocaleCode>("en");
  const [businessType, setBusinessTypeState] = useState<BusinessType>("retail");
  const [strings, setStrings] = useState<Record<string, string>>(BASE_STRINGS);
  const [translating, setTranslating] = useState(false);

  const loadTranslations = useCallback(async (loc: LocaleCode) => {
    if (loc === "en") { setStrings(BASE_STRINGS); return; }
    setTranslating(true);
    const result = await fetchTranslations(LOCALE_LANG_MAP[loc]);
    setStrings(result);
    setTranslating(false);
  }, []);

  useEffect(() => {
    const c = localStorage.getItem("app_currency");
    const l = localStorage.getItem("app_locale") as LocaleCode | null;
    const b = localStorage.getItem("app_business_type") as BusinessType | null;
    if (c) setCurrencyState(c);
    if (b && ["retail", "restaurant", "service"].includes(b)) {
      setBusinessTypeState(b);
      applyTheme(b);
    }
    const initLocale = (l && ["en", "rw", "sw"].includes(l)) ? l as LocaleCode : "en";
    setLocaleState(initLocale);
    loadTranslations(initLocale);
  }, [loadTranslations]);

  const setCurrency = (code: string) => {
    setCurrencyState(code);
    localStorage.setItem("app_currency", code);
  };

  const setLocale = (code: LocaleCode) => {
    setLocaleState(code);
    localStorage.setItem("app_locale", code);
    loadTranslations(code);
  };

  const setBusinessType = (type: BusinessType) => {
    setBusinessTypeState(type);
    localStorage.setItem("app_business_type", type);
    applyTheme(type);
  };

  const currencySymbol = currencies.find((c) => c.code === currency)?.symbol ?? currency;
  const t = (key: string) => strings[key] ?? BASE_STRINGS[key] ?? key;

  return (
    <AppConfigContext.Provider value={{
      currency, currencySymbol, locale, businessType, translating,
      t, setCurrency, setLocale, setBusinessType,
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
