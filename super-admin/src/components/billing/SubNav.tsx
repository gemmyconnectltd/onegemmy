"use client";

import { usePathname } from "next/navigation";
import { BILLING_NAV, isNavActive } from "@/components/shell/nav";
import { SecondaryNav } from "@/components/ui/SecondaryNav";

/** Second sidebar for every Plans & Billing page. */
export function BillingSubNav() {
  const pathname = usePathname();
  return <SecondaryNav label="Plans & Billing" title="Plans & Billing" items={BILLING_NAV.map((i) => ({ key: i.href, label: i.name, icon: i.icon, href: i.href, active: isNavActive(pathname, i.href) && (i.href !== "/plans" || pathname === "/plans" || pathname.startsWith("/plans/")) }))} />;
}
