export type Theme = "light" | "dark";

/**
 * Fixed neutral base — every tenant shares these background/surface/border
 * tones. The only thing that varies per tenant is the brand accent color
 * (see `DEFAULT_BRAND_COLOR` and `brandColorPresets` below), set once in
 * Settings > Appearance and applied for everyone at that company.
 */
export type BaseTheme = {
  background: string; surface: string; card: string; border: string;
  foreground: string; muted: string;
};

export const baseThemeLight: BaseTheme = {
  background: "#ffffff", surface: "#f8f8f6", card: "#ffffff", border: "#e8e4de",
  foreground: "#2b2118", muted: "#7a7d7e",
};

export const baseThemeDark: BaseTheme = {
  background: "#0d0d0f", surface: "#151519", card: "#1c1c21", border: "#2c2c33",
  foreground: "#f1f1f4", muted: "#a0a2ab",
};

export const DEFAULT_BRAND_COLOR = "#6f1a07";

export const brandColorPresets = [
  "#6f1a07", "#b45309", "#1d4ed8", "#059669",
  "#7c3aed", "#0e7490", "#be123c", "#0f766e",
];

export const siteConfig = {
  name: "OneGemmy",
  title: "OneGemmy — Simple Shop Management",
  description:
    "Manage sales, inventory, expenses, and profits for your one-person shop.",
  company: "Gemmy Connect Ltd",
  url: "https://onegemmy.com",
  links: {
    github: "https://github.com/gemmyconnectltd",
    linkedin: "https://linkedin.com/company/gemmyconnectltd",
  },
  colors: {
    primary: "#af9164",
    secondary: "#6f5a3a",
    accent: "#6f1a07",
    success: "#10B981",
    background: "#ffffff",
    surface: "#f8f8f6",
    foreground: "#2b2118",
    muted: "#b3b6b7",
    border: "#e8e4de",
    sidebar: "#111111",
  },
};

export const navigation = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Sales", href: "/sales" },
  { name: "Products", href: "/products" },
  { name: "Inventory", href: "/inventory" },
  { name: "Expenses", href: "/expenses" },
  { name: "Customers", href: "/customers" },
  { name: "Reports", href: "/reports" },
  { name: "Settings", href: "/settings" },
];

export const expenseCategories = [
  "Rent",
  "Utilities",
  "Inventory Purchase",
  "Transport",
  "Packaging",
  "Marketing",
  "Maintenance",
  "Other",
];

export const CURRENCY = "RWF";
export const CURRENCY_SYMBOL = "RWF";

/** Format a money value as full number with comma separators e.g. "RWF 1,250,000" */
export function fmtMoney(value: number | null | undefined, symbol = CURRENCY_SYMBOL): string {
  const v = Number(value ?? 0);
  if (isNaN(v)) return `${symbol} 0`;
  return `${symbol} ${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export const currencies = [
  { code: "RWF", symbol: "RWF", name: "Rwandan Franc" },
  { code: "USD", symbol: "$",   name: "US Dollar" },
  { code: "EUR", symbol: "€",   name: "Euro" },
  { code: "KES", symbol: "KSh", name: "Kenyan Shilling" },
  { code: "UGX", symbol: "USh", name: "Ugandan Shilling" },
  { code: "TZS", symbol: "TSh", name: "Tanzanian Shilling" },
];

export const locales = [
  { code: "en", name: "English" },
  { code: "rw", name: "Kinyarwanda" },
  { code: "sw", name: "Kiswahili" },
] as const;

export type LocaleCode = "en" | "rw" | "sw";
