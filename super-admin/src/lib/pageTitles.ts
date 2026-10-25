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
  "/traffic": "Website Traffic",
  "/traffic/sources": "Traffic Sources",
  "/traffic/pages": "Top Pages",
  "/traffic/campaigns": "Campaigns",
  "/erp-traffic": "ERP Traffic",
  "/erp-traffic/modules": "ERP Modules",
  "/erp-traffic/businesses": "ERP Businesses",
  "/erp-traffic/devices": "ERP Devices",
  "/erp-traffic/engagement": "ERP Engagement",
  "/marketing": "Marketing",
  "/marketing/audience": "Audience",
  "/marketing/campaigns": "Campaigns",
  "/marketing/newsletters": "Newsletters",
  "/marketing/automations": "Automations",
  "/marketing/templates": "Templates",
  "/marketing/analytics": "Marketing Analytics",
  "/marketing/settings": "Marketing Settings",
  "/usage": "Usage",
  "/settings": "Settings",
};

/** Browser-tab title for a portal path, e.g. "/tenants/abc" → "Tenants · Pesaa Super Admin". */
export function pageTitleForPath(pathname: string): string {
  const key = TITLES[pathname] ? pathname : Object.keys(TITLES).filter((p) => p !== "/" && pathname.startsWith(p + "/")).sort((a, b) => b.length - a.length)[0];
  return `${(key && TITLES[key]) || "Super Admin"} · ${siteConfig.title}`;
}
