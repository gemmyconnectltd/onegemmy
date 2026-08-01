export type BusinessType = "retail" | "restaurant" | "service";
export type Theme = "light" | "dark";

export const businessTypes: { code: BusinessType; name: string; icon: string }[] = [
  { code: "retail",     name: "Retail Shop",   icon: "🛍️" },
  { code: "restaurant", name: "Restaurant",     icon: "🍽️" },
  { code: "service",    name: "Service",        icon: "🔧" },
];

export type BusinessTheme = {
  background: string; surface: string; card: string; border: string;
  accent: string; primary: string; foreground: string; muted: string;
};

export const businessThemes: Record<BusinessType, BusinessTheme> = {
  retail: {
    background: "#ffffff", surface: "#f8f8f6", card: "#ffffff", border: "#e8e4de",
    accent: "#6f1a07",    primary: "#af9164",  foreground: "#2b2118", muted: "#7a7d7e",
  },
  restaurant: {
    background: "#fffbf5", surface: "#fdf3e3", card: "#ffffff", border: "#f0dfc0",
    accent: "#b45309",    primary: "#d97706",  foreground: "#1c1008", muted: "#78716c",
  },
  service: {
    background: "#f8faff", surface: "#eef2ff", card: "#ffffff", border: "#dde3f5",
    accent: "#1d4ed8",    primary: "#3b82f6",  foreground: "#0f172a", muted: "#64748b",
  },
};

export const businessThemesDark: Record<BusinessType, BusinessTheme> = {
  retail: {
    background: "#0d0d0f", surface: "#151519", card: "#1c1c21", border: "#2c2c33",
    accent: "#d4673f",    primary: "#d8b98a",  foreground: "#f1f1f4", muted: "#a0a2ab",
  },
  restaurant: {
    background: "#100d0a", surface: "#181410", card: "#1f1a14", border: "#3a3026",
    accent: "#ea9030",    primary: "#e8c884",  foreground: "#f5efe7", muted: "#a99c8b",
  },
  service: {
    background: "#0d121e", surface: "#141b2b", card: "#1a2336", border: "#2a3752",
    accent: "#6a92f4",    primary: "#7aa2ff",  foreground: "#e8edf7", muted: "#94a3b8",
  },
};

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

/** Format a money value. >= 1 000 000 → "RWF 1.2M", >= 1 000 → "RWF 12.5K", else full number. */
export function fmtMoney(value: number | null | undefined, symbol = CURRENCY_SYMBOL): string {
  const v = Number(value ?? 0);
  if (isNaN(v)) return `${symbol} 0`;
  if (v >= 1_000_000) return `${symbol} ${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 1_000)     return `${symbol} ${(v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1)}K`;
  return `${symbol} ${v.toLocaleString()}`;
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
