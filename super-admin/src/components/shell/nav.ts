import { Activity, BarChart3, Building2, CreditCard, Crown, Headset, Receipt, RefreshCw, TicketPercent, Wallet, Inbox, LayoutDashboard, Mail, MessageCircle, PenSquare, Settings, SlidersHorizontal, Users } from "lucide-react";

export const NAV_ITEMS = [
  { name: "Overview", href: "/", icon: LayoutDashboard },
  { name: "Tenants", href: "/tenants", icon: Building2 },
  // One entry for the whole billing area; its six pages are the tab strip at the top of every billing page.
  { name: "Plans & Billing", href: "/plans", icon: CreditCard },
  { name: "Usage", href: "/usage", icon: Activity },
  // One entry for the whole Support area; its seven pages are the tab strip at the top of every Support page.
  { name: "Customer Support", href: "/support", icon: Headset },
  { name: "Settings", href: "/settings", icon: Settings },
] as const;

/** The pages inside Customer Support (shown as the tab strip). "Support Settings" is distinct from platform Settings. */
export const SUPPORT_NAV = [
  { name: "Inbox", href: "/support", icon: Inbox },
  { name: "New Message", href: "/support/new", icon: PenSquare },
  { name: "Email Templates", href: "/support/email-templates", icon: Mail },
  { name: "WhatsApp Templates", href: "/support/whatsapp-templates", icon: MessageCircle },
  { name: "Team & Assignments", href: "/support/team", icon: Users },
  { name: "Support Analytics", href: "/support/analytics", icon: BarChart3 },
  { name: "Support Settings", href: "/support/settings", icon: SlidersHorizontal },
] as const;

/** The pages inside Plans & Billing (shown as the tab strip). "Billing Settings" is distinct from platform Settings. */
export const BILLING_NAV = [
  { name: "Plans", href: "/plans", icon: Crown },
  { name: "Subscriptions", href: "/subscriptions", icon: RefreshCw },
  { name: "Payments", href: "/payments", icon: Wallet },
  { name: "Invoices", href: "/invoices", icon: Receipt },
  { name: "Coupons & Discounts", href: "/coupons", icon: TicketPercent },
  { name: "Billing Settings", href: "/billing-settings", icon: SlidersHorizontal },
] as const;

const BILLING_PREFIXES = BILLING_NAV.map((i) => i.href);

/** "/" is every page's prefix, so it only matches exactly; every other item matches itself and its sub-pages. */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  // Users no longer has its own sidebar entry: per-business users live under Tenants, and the cross-business
  // search at /users is reached from the Tenants page, so Tenants stays highlighted there.
  if (href === "/tenants" && (pathname === "/users" || pathname.startsWith("/users/"))) return true;
  if (href === "/plans") return BILLING_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  return pathname === href || pathname.startsWith(href + "/");
}

/** Inbox owns /support and every /support/conversations/* page; the other Support items match themselves. */
export function isSupportActive(pathname: string, href: string): boolean {
  if (href === "/support") return pathname === "/support" || pathname.startsWith("/support/conversations");
  return isNavActive(pathname, href);
}
