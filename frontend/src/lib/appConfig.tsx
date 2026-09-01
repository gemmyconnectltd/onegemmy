"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  currencies, locales, baseThemeLight, baseThemeDark, DEFAULT_BRAND_COLOR, brandColorPresets,
  type LocaleCode, type Theme,
} from "./config";
import { getStoredToken, resolveUploadUrl } from "./api/client";
import { tenantsApi, type Tenant } from "./api/tenants";

// All English base strings — single source of truth
const BASE_STRINGS: Record<string, string> = {
  // ── Nav ──
  dashboard: "Dashboard", sales: "Sales", inventory: "Inventory",
  accounting: "Accounting", procurement: "Procurement", hr: "HR",
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

  // ── Common actions ──
  addProduct: "Add Product", edit: "Edit", delete: "Delete", cancel: "Cancel",
  save: "Save Changes", restock: "Restock", adjust: "Adjust",
  import: "Import", export: "Export", download: "Download",
  confirm: "Confirm", close: "Close", viewAll: "View all",
  active: "Active", inactive: "Inactive", all: "All",
  noResults: "No products found", tryAdjusting: "Try adjusting your search or filters",

  // ── Common labels ──
  name: "Name", sku: "SKU", category: "Category", brand: "Brand", unitLabel: "Unit",
  costPrice: "Cost price", sellingPrice: "Selling price", stock: "Stock",
  minStock: "Min stock", margin: "Margin", status: "Status", value: "Value",
  product: "Product", quantity: "Quantity", reason: "Reason", notes: "Notes",
  optional: "optional",

  // ── Inventory overview ──
  inventoryOverview: "Inventory Overview",
  inventoryOverviewSub: "Monitor stock levels, value, and alerts across all products",
  totalProducts: "Total Products", skusTracked: "SKUs tracked",
  stockValue: "Stock Value", atCostPrice: "At cost price",
  lowStock: "Low Stock", needReorder: "Need reorder",
  outOfStock: "Out of Stock", immediateAction: "Immediate action",
  stockHealth: "Stock Health", inStock: "In Stock",
  overallHealthScore: "Overall health score",
  topProductsByValue: "Top Products by Value",
  searchByNameOrSku: "Search by name or SKU...",
  low: "Low", out: "Out",
  reviewReorderSoon: "review and reorder soon.",
  productsOutOfStock: "product(s) out of stock", runningLow: "running low",
  totalValue: "Total value",

  // ── Products page ──
  productsPageSub: "products", activeCount: "active",
  searchProducts: "Search products...", results: "results",
  cost: "Cost", price: "Price", avgMargin: "Avg margin",
  deleteProduct: "Delete Product", deleteWarning: "This action cannot be undone.",
  deleteConfirmMsg: "Are you sure you want to delete", deleteConfirmMsg2: "This will remove it from your inventory.",

  // ── Restock drawer ──
  restockProduct: "Restock Product", adjustStock: "Adjust Stock",
  currentStock: "Current stock", stockUnits: "units",
  qtyToAdd: "Quantity to add", newStockCount: "New stock count",
  newTotalWillBe: "New total will be", stockAfterAction: "Stock after this action",
  addStock: "Add Stock", applyAdjustment: "Apply Adjustment",
  purchaseFromSupplier: "Purchase from supplier", returnFromCustomer: "Return from customer",
  foundInWarehouse: "Found in warehouse", other: "Other",
  damagedGoods: "Damaged goods", theftLoss: "Theft / loss",
  miscounted: "Miscounted", expired: "Expired",
  additionalDetails: "Any additional details...",

  // ── Product form ──
  addProductTitle: "Add Product", editProductTitle: "Edit Product",
  createProductSub: "Create a new product in your inventory",
  productNamePlaceholder: "e.g. Phone Case - iPhone",
  skuPlaceholder: "e.g. PC-001", brandPlaceholder: "e.g. Anker",
  singleProduct: "Single", bulkImport: "Bulk Import",
  importProducts: "Import Products", uploadCsv: "Upload a CSV file",
  downloadTemplate: "Download CSV template",
  downloadTemplateSub: "Fill it in Excel or Google Sheets, then upload",
  dropCsvHere: "Drop your CSV here or click to browse", onlyCsv: "Only .csv files",
  previewRows: "rows", clearPreview: "Clear",
  rowsHaveErrors: "row(s) have errors and will be skipped on import.",
  noRowsFound: "No rows found. Make sure the file has a header row and data rows.",
  incompleteRowsSkipped: "Fill in each row. Incomplete rows are skipped.",
  addAnotherRow: "Add another row",

  // ── Dashboard ──
  helloOwner: "Owner", hereIsYourShop: "Here's your shop today.",
  todaysSales: "Today's Sales", todaysExpenses: "Today's Expenses",
  todaysProfit: "Today's Profit", cashAvailable: "Cash Available",
  productsRunningLow: "products are running low on stock.",
  salesThisWeek: "Sales This Week", dailyRevenueVsExpenses: "Daily revenue vs expenses",
  quickActions: "Quick Actions", recordSale: "Record Sale",
  addStockAction: "Add Stock", recordExpense: "Record Expense",
  recentSales: "Recent Sales", customer: "Customer", items: "Items",
  total: "Total", method: "Method", time: "Time",
};


const LOCALE_LANG_MAP: Record<LocaleCode, string> = {
  en: "en",
  rw: "rw",
  sw: "sw",
};

const VALID_LOCALES: LocaleCode[] = ["en", "rw", "sw"];
export type NavOrientation = "top" | "left" | "big";
const VALID_ORIENTATIONS: NavOrientation[] = ["top", "left", "big"];

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

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function applyTheme(theme: Theme, accent: string) {
  const base = theme === "dark" ? baseThemeDark : baseThemeLight;
  const safeAccent = HEX_COLOR_RE.test(accent) ? accent : DEFAULT_BRAND_COLOR;
  const root = document.documentElement;
  root.style.setProperty("--background", base.background);
  root.style.setProperty("--surface", base.surface);
  root.style.setProperty("--card", base.card);
  root.style.setProperty("--border", base.border);
  root.style.setProperty("--accent", safeAccent);
  root.style.setProperty("--primary", safeAccent);
  root.style.setProperty("--foreground", base.foreground);
  root.style.setProperty("--muted", base.muted);
}

interface AppConfig {
  currency: string;
  currencySymbol: string;
  locale: LocaleCode;
  theme: Theme;
  navOrientation: NavOrientation;
  vatEnabled: boolean;
  translating: boolean;
  /** The tenant's brand accent color (hex). Set once in Settings > Appearance
   *  by the tenant's admin — applies to every user at that company. */
  brandColor: string;
  /** The tenant's logo URL, or null if not set. */
  logoUrl: string | null;
  t: (key: string) => string;
  setCurrency: (code: string) => void;
  setLocale: (code: LocaleCode) => void;
  setTheme: (theme: Theme) => void;
  setNavOrientation: (orientation: NavOrientation) => void;
  setVatEnabled: (enabled: boolean) => void;
  /** Applies a new brand color to the live theme. Callers are responsible for
   *  persisting it (see `useUpdateTenant`) — this only updates what's shown. */
  setBrandColor: (hex: string) => void;
  /** Applies a new logo URL after it's been uploaded (see `useUploadTenantLogo`). */
  setLogoUrl: (url: string | null) => void;
  currencies: typeof currencies;
  locales: typeof locales;
  brandColorPresets: typeof brandColorPresets;
}

const AppConfigContext = createContext<AppConfig | null>(null);

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState("RWF");
  const [locale, setLocaleState] = useState<LocaleCode>("en");
  const [theme, setThemeState] = useState<Theme>("light");
  const [navOrientation, setNavOrientationState] = useState<NavOrientation>("left");
  const [vatEnabled, setVatEnabledState] = useState(true);
  const [brandColor, setBrandColor] = useState(DEFAULT_BRAND_COLOR);
  const [logoUrl, setLogoUrlRaw] = useState<string | null>(null);
  const setLogoUrl = (url: string | null) => setLogoUrlRaw(resolveUploadUrl(url));

  // Restore persisted settings client-side only (avoids SSR hydration mismatch)
  useEffect(() => {
    // Always reset currency to RWF — clear any stale non-RWF value
    localStorage.setItem("app_currency", "RWF");
    const l = localStorage.getItem("app_locale");
    if (l && VALID_LOCALES.includes(l as LocaleCode)) setLocaleState(l as LocaleCode);
    const t = localStorage.getItem("app_theme");
    if (t === "dark" || t === "light") setThemeState(t);
    const o = localStorage.getItem("app_nav_orientation");
    if (o && VALID_ORIENTATIONS.includes(o as NavOrientation)) setNavOrientationState(o as NavOrientation);
    const v = localStorage.getItem("app_vat_enabled");
    if (v !== null) setVatEnabledState(v !== "false");
  }, []);

  // Load the tenant's branding (brand color + logo) whenever the signed-in
  // token changes — covers first load, and login/logout happening client-side
  // without a full page reload (the token itself never renders, so we can't
  // depend on it directly; re-checking on each navigation is cheap and catches
  // the transition). Deferred to a timeout so this has no synchronous setState
  // in the effect body (see hydration-safety rule above).
  const pathname = usePathname();
  const lastTokenRef = useRef<string | null>(null);
  useEffect(() => {
    const token = getStoredToken();
    if (token === lastTokenRef.current) return;
    lastTokenRef.current = token;
    const id = window.setTimeout(() => {
      if (!token) {
        setBrandColor(DEFAULT_BRAND_COLOR);
        setLogoUrl(null);
        return;
      }
      tenantsApi.getCurrent()
        .then((res: { data: Tenant }) => {
          setBrandColor(res.data.brand_color || DEFAULT_BRAND_COLOR);
          setLogoUrl(res.data.logo_url ?? null);
        })
        .catch(() => {
          // Request failed — keep whatever brand color is already applied.
        });
    }, 0);
    return () => window.clearTimeout(id);
  }, [pathname]);

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
    applyTheme(theme, brandColor);
  }, [theme, brandColor]);

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

  const setTheme = (next: Theme) => {
    setThemeState(next);
    localStorage.setItem("app_theme", next);
  };

  const setNavOrientation = (next: NavOrientation) => {
    setNavOrientationState(next);
    localStorage.setItem("app_nav_orientation", next);
  };

  const setVatEnabled = (next: boolean) => {
    setVatEnabledState(next);
    localStorage.setItem("app_vat_enabled", String(next));
  };

  const currencySymbol = currencies.find((c) => c.code === "RWF")?.symbol ?? "RWF";
  const t = (key: string) => strings[key] ?? BASE_STRINGS[key] ?? key;

  return (
    <AppConfigContext.Provider value={{
      currency, currencySymbol, locale, theme, navOrientation, vatEnabled, translating,
      brandColor, logoUrl,
      t, setCurrency, setLocale, setTheme, setNavOrientation, setVatEnabled, setBrandColor, setLogoUrl,
      currencies, locales, brandColorPresets,
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
