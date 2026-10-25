import { BarChart3, Activity, Building2, CreditCard, Crown, Headset, Receipt, RefreshCw, TicketPercent, Wallet, Megaphone, Mail, Send, FileText, Workflow, LineChart, Newspaper, Gauge, MousePointerClick, Share2, LayoutGrid, Smartphone, Inbox, LayoutDashboard, Settings, Ticket, SlidersHorizontal, Users } from "lucide-react";

export const NAV_ITEMS = [
  { name: "Overview", href: "/", icon: LayoutDashboard },
  { name: "Tenants", href: "/tenants", icon: Building2 },
  // One entry for the whole billing area; its six pages are the tab strip at the top of every billing page.
  { name: "Plans & Billing", href: "/plans", icon: CreditCard },
  // One entry for Website Traffic and ERP Traffic; their pages are the second sidebar on every traffic page.
  { name: "Traffic", href: "/traffic", icon: MousePointerClick },
  // One entry for the whole Marketing Hub; its eight pages are the second sidebar on every marketing page.
  { name: "Marketing", href: "/marketing", icon: Megaphone },
  { name: "Usage", href: "/usage", icon: Activity },
  // One entry for the whole Support area; its seven pages are the tab strip at the top of every Support page.
  { name: "Customer Support", href: "/support", icon: Headset },
  { name: "Settings", href: "/settings", icon: Settings },
] as const;

/** The four sections of Customer Support (shown in its second sidebar). */
export const SUPPORT_NAV = [
  { name: "Inbox", href: "/support", icon: Inbox },
  { name: "Tickets", href: "/support/tickets", icon: Ticket },
  { name: "Team", href: "/support/team", icon: Users },
  { name: "Settings", href: "/support/settings", icon: SlidersHorizontal },
] as const;

/** Website Traffic and ERP Traffic, each with its detail pages (shown in the Traffic second sidebar). */
export const TRAFFIC_NAV = [
  { group: "Website", name: "Overview", href: "/traffic", icon: MousePointerClick },
  { group: "Website", name: "Sources", href: "/traffic/sources", icon: Share2 },
  { group: "Website", name: "Pages", href: "/traffic/pages", icon: FileText },
  { group: "Website", name: "Campaigns", href: "/traffic/campaigns", icon: Megaphone },
  { group: "ERP", name: "Overview", href: "/erp-traffic", icon: Gauge },
  { group: "ERP", name: "Modules", href: "/erp-traffic/modules", icon: LayoutGrid },
  { group: "ERP", name: "Businesses", href: "/erp-traffic/businesses", icon: Building2 },
  { group: "ERP", name: "Devices", href: "/erp-traffic/devices", icon: Smartphone },
  { group: "ERP", name: "Engagement", href: "/erp-traffic/engagement", icon: Activity },
] as const;

export function isTrafficActive(pathname: string, href: string): boolean {
  if (href === "/traffic" || href === "/erp-traffic") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

/** The eight pages of the Marketing Hub (shown in its second sidebar). */
export const MARKETING_NAV = [
  { name: "Overview", href: "/marketing", icon: LayoutDashboard },
  { name: "Audience", href: "/marketing/audience", icon: Users },
  { name: "Campaigns", href: "/marketing/campaigns", icon: Send },
  { name: "Newsletters", href: "/marketing/newsletters", icon: Newspaper },
  { name: "Automations", href: "/marketing/automations", icon: Workflow },
  { name: "Templates", href: "/marketing/templates", icon: FileText },
  { name: "Analytics", href: "/marketing/analytics", icon: LineChart },
  { name: "Settings", href: "/marketing/settings", icon: Mail },
] as const;

export function isMarketingActive(pathname: string, href: string): boolean {
  if (href === "/marketing") return pathname === "/marketing";
  return pathname === href || pathname.startsWith(href + "/");
}

/** The pages inside Plans & Billing (shown as the tab strip). "Billing Settings" is distinct from platform Settings. */
export const BILLING_NAV = [
  { name: "Overview", href: "/billing-overview", icon: BarChart3 },
  { name: "Plans", href: "/plans", icon: Crown },
  { name: "Subscriptions", href: "/subscriptions", icon: RefreshCw },
  { name: "Payments", href: "/payments", icon: Wallet },
  { name: "Invoices", href: "/invoices", icon: Receipt },
  { name: "Discounts", href: "/coupons", icon: TicketPercent },
  { name: "Billing Settings", href: "/billing-settings", icon: SlidersHorizontal },
] as const;

const BILLING_PREFIXES = BILLING_NAV.map((i) => i.href);

/** "/" is every page's prefix, so it only matches exactly; every other item matches itself and its sub-pages. */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  // Users no longer has its own sidebar entry: per-business users live under Tenants, and the cross-business
  // search at /users is reached from the Tenants page, so Tenants stays highlighted there.
  if (href === "/tenants" && (pathname === "/users" || pathname.startsWith("/users/"))) return true;
  if (href === "/traffic") return pathname === "/traffic" || pathname.startsWith("/traffic/") || pathname === "/erp-traffic" || pathname.startsWith("/erp-traffic/");
  if (href === "/plans") return BILLING_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  return pathname === href || pathname.startsWith(href + "/");
}

export function isSupportActive(pathname: string, href: string): boolean {
  if (href === "/support") return pathname === "/support";
  return isNavActive(pathname, href);
}
