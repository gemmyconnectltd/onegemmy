"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import {
  currencies, locales, businessTypes, businessThemes, businessThemesDark,
  type LocaleCode, type BusinessType, type Theme,
} from "./config";

// All English base strings — single source of truth
const BASE_STRINGS: Record<string, string> = {
  // ── Nav ──
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
  root.style.setProperty("--card", palette.card);
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
