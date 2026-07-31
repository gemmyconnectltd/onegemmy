export type BusinessType = "retail" | "restaurant" | "service";

export const businessTypes: { code: BusinessType; name: string; icon: string }[] = [
  { code: "retail",     name: "Retail Shop",   icon: "🛍️" },
  { code: "restaurant", name: "Restaurant",     icon: "🍽️" },
  { code: "service",    name: "Service",        icon: "🔧" },
];

export const businessThemes: Record<BusinessType, {
  background: string; surface: string; border: string;
  accent: string; primary: string; foreground: string; muted: string;
}> = {
  retail: {
    background: "#ffffff", surface: "#f8f8f6", border: "#e8e4de",
    accent: "#6f1a07",    primary: "#af9164",  foreground: "#2b2118", muted: "#7a7d7e",
  },
  restaurant: {
    background: "#fffbf5", surface: "#fdf3e3", border: "#f0dfc0",
    accent: "#b45309",    primary: "#d97706",  foreground: "#1c1008", muted: "#78716c",
  },
  service: {
    background: "#f8faff", surface: "#eef2ff", border: "#dde3f5",
    accent: "#1d4ed8",    primary: "#3b82f6",  foreground: "#0f172a", muted: "#64748b",
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
