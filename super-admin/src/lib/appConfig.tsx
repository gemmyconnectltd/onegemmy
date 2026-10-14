"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { BRAND_COLOR, CURRENCY, CURRENCY_SYMBOL, baseThemeDark, baseThemeLight, currencies, type Theme } from "./config";

const THEME_KEY = "admin_theme";

interface AppConfig {
  theme: Theme;
  setTheme: (t: Theme) => void;
  /** Platform reporting currency symbol/code used by the admin formatters. */
  currency: string;
  currencySymbol: string;
  currencies: typeof currencies;
}

const AppConfigContext = createContext<AppConfig | undefined>(undefined);

function applyTheme(theme: Theme) {
  const base = theme === "dark" ? baseThemeDark : baseThemeLight;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.setProperty("--background", base.background);
  root.style.setProperty("--surface", base.surface);
  root.style.setProperty("--card", base.card);
  root.style.setProperty("--border", base.border);
  root.style.setProperty("--foreground", base.foreground);
  root.style.setProperty("--muted", base.muted);
  root.style.setProperty("--accent", BRAND_COLOR);
  root.style.setProperty("--primary", BRAND_COLOR);
}

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  // Restore the saved theme after mount so server and first client render match.
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch { /* storage blocked: stay light */ }
    queueMicrotask(() => setThemeState(saved === "dark" ? "dark" : "light"));
  }, []);

  useEffect(() => { applyTheme(theme); }, [theme]);

  const value = useMemo<AppConfig>(() => ({
    theme,
    setTheme: (t) => { setThemeState(t); try { localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ } },
    currency: CURRENCY,
    currencySymbol: CURRENCY_SYMBOL,
    currencies,
  }), [theme]);

  return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>;
}

export function useAppConfig() {
  const ctx = useContext(AppConfigContext);
  if (!ctx) throw new Error("useAppConfig must be used within AppConfigProvider");
  return ctx;
}
