// Shared plan data for the /pricing page. Prices are the figures supplied for
// the marketing site; annual billing is the monthly price less ANNUAL_DISCOUNT.
// Keep this the single source so pricing surfaces never drift apart.

export type Region = "rwanda" | "international";

export interface Plan {
  id: string;
  title: string;
  /** Monthly price per region; null means custom/quote-based. */
  monthly: Record<Region, number | null>;
  featured: boolean;
  tagline?: string;
  features: string[];
}

export const ANNUAL_DISCOUNT = 0.2;

export const regions: Record<Region, { label: string; currency: string; flag?: string }> = {
  rwanda: { label: "Rwanda (RWF)", currency: "RWF", flag: "/flags/rw.svg" },
  international: { label: "International (USD)", currency: "USD" },
};

export const plans: Plan[] = [
  {
    id: "launch",
    title: "Launch",
    monthly: { rwanda: 15000, international: 30 },
    featured: false,
    features: ["1 user", "1 branch", "POS & sales", "Inventory", "Expense tracking", "Digital receipts", "Email & chat support"],
  },
  {
    id: "starter",
    title: "Starter",
    monthly: { rwanda: 45000, international: 50 },
    featured: false,
    features: ["Up to 4 users", "Up to 3 branches", "Everything in Launch", "Purchases & suppliers", "Customer management", "Low-stock alerts", "Basic reports"],
  },
  {
    id: "growth",
    title: "Growth",
    monthly: { rwanda: 125000, international: 100 },
    featured: true,
    features: ["5 – 20 users", "Multiple branches", "Everything in Starter", "Advanced reports", "Payroll & HR tools", "User roles & permissions", "Priority support"],
  },
  {
    id: "professional",
    title: "Professional",
    monthly: { rwanda: 250000, international: 200 },
    featured: false,
    features: ["21 – 100 users", "Multiple branches", "Everything in Growth", "Advanced accounting", "Custom workflows", "API access", "Dedicated support"],
  },
  {
    id: "enterprise",
    title: "Enterprise",
    monthly: { rwanda: null, international: null },
    featured: false,
    tagline: "Tailored to your needs",
    features: ["Unlimited users", "Unlimited branches", "Custom integrations", "Dedicated infrastructure", "SLA & uptime guarantees", "Onboarding & training", "Custom features"],
  },
];

/** Cell value in the comparison table: true = included, false = not included, string = limit/detail. */
export type Cell = boolean | string;

export interface FeatureRow {
  label: string;
  /** One value per plan, in `plans` order: Launch, Starter, Growth, Professional, Enterprise. */
  values: [Cell, Cell, Cell, Cell, Cell];
}

export interface FeatureGroup {
  title: string;
  rows: FeatureRow[];
}

export const featureGroups: FeatureGroup[] = [
  {
    title: "Sales",
    rows: [
      { label: "POS & sales", values: [true, true, true, true, true] },
      { label: "Digital receipts", values: [true, true, true, true, true] },
    ],
  },
  {
    title: "Inventory & purchasing",
    rows: [
      { label: "Inventory management", values: [true, true, true, true, true] },
      { label: "Low-stock alerts", values: [false, true, true, true, true] },
      { label: "Purchases & suppliers", values: [false, true, true, true, true] },
    ],
  },
  {
    title: "Expenses & customers",
    rows: [
      { label: "Expense tracking", values: [true, true, true, true, true] },
      { label: "Customer management", values: [false, true, true, true, true] },
    ],
  },
  {
    title: "Reports & accounting",
    rows: [
      { label: "Basic reports", values: [false, true, true, true, true] },
      { label: "Advanced reports", values: [false, false, true, true, true] },
      { label: "Advanced accounting", values: [false, false, false, true, true] },
      { label: "Custom workflows", values: [false, false, false, true, true] },
    ],
  },
  {
    title: "People & HR",
    rows: [
      { label: "Payroll & HR tools", values: [false, false, true, true, true] },
      { label: "User roles & permissions", values: [false, false, true, true, true] },
    ],
  },
  {
    title: "Users & branches",
    rows: [
      { label: "Users", values: ["1", "Up to 4", "5 – 20", "21 – 100", "Unlimited"] },
      { label: "Branches", values: ["1", "Up to 3", "Multiple", "Multiple", "Unlimited"] },
    ],
  },
  {
    title: "Integrations & infrastructure",
    rows: [
      { label: "API access", values: [false, false, false, true, true] },
      { label: "Custom integrations", values: [false, false, false, false, true] },
      { label: "Dedicated infrastructure", values: [false, false, false, false, true] },
      { label: "SLA & uptime guarantees", values: [false, false, false, false, true] },
      { label: "Custom features", values: [false, false, false, false, true] },
    ],
  },
  {
    title: "Support",
    rows: [
      { label: "Email & chat support", values: [true, true, true, true, true] },
      { label: "Priority support", values: [false, false, true, true, true] },
      { label: "Dedicated support", values: [false, false, false, true, true] },
      { label: "Onboarding & training", values: [false, false, false, false, true] },
    ],
  },
];
