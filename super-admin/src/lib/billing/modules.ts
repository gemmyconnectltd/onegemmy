// Fallback module list used only when the feature-flag endpoint can't be reached. Keys follow the backend
// FeatureFlag.key convention (module-level flags). The live list comes from adminApi.listFeatures().
export const FALLBACK_MODULES: { key: string; name: string; module: string }[] = [
  { key: "sales", name: "Sales & POS", module: "sales" },
  { key: "inventory", name: "Inventory", module: "inventory" },
  { key: "procurement", name: "Procurement", module: "procurement" },
  { key: "accounting", name: "Accounting", module: "accounting" },
  { key: "hr", name: "HR & Payroll", module: "hr" },
  { key: "reports", name: "Reports", module: "reports" },
  { key: "ai", name: "AI assistant", module: "ai" },
];
