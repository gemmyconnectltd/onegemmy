import { siteConfig } from "./config";

export const APP_NAME = siteConfig.name;

const TITLES: Record<string, string> = {
  "/": "Platform Overview",
  "/tenants": "Tenants",
  "/users": "Users",
  "/support": "Support Inbox",
  "/support/tickets": "Support Tickets",
  "/support/team": "Support Team",
  "/support/settings": "Support Settings",
  "/billing-overview": "Billing Overview",
  "/plans": "Plans",
  "/subscriptions": "Subscriptions",
  "/payments": "Payments",
  "/invoices": "Invoices",
  "/coupons": "Coupons & Discounts",
  "/billing-settings": "Billing Settings",
  "/usage": "Usage",
  "/settings": "Settings",
};

/** Browser-tab title for a portal path, e.g. "/tenants/abc" → "Tenants · Pesaa Super Admin". */
export function pageTitleForPath(pathname: string): string {
  const key = TITLES[pathname] ? pathname : Object.keys(TITLES).filter((p) => p !== "/" && pathname.startsWith(p + "/")).sort((a, b) => b.length - a.length)[0];
  return `${(key && TITLES[key]) || "Super Admin"} · ${siteConfig.title}`;
}
