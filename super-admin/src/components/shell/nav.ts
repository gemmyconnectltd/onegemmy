import { Activity, Building2, Crown, LayoutDashboard, Settings, Users } from "lucide-react";

export const NAV_ITEMS = [
  { name: "Overview", href: "/", icon: LayoutDashboard },
  { name: "Tenants", href: "/tenants", icon: Building2 },
  { name: "Users", href: "/users", icon: Users },
  { name: "Plans", href: "/plans", icon: Crown },
  { name: "Usage", href: "/usage", icon: Activity },
  { name: "Settings", href: "/settings", icon: Settings },
] as const;

/** "/" is every page's prefix, so it only matches exactly; every other item matches itself and its sub-pages. */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
