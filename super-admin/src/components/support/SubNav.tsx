"use client";

import { usePathname } from "next/navigation";
import { SUPPORT_NAV, isSupportActive } from "@/components/shell/nav";
import { SecondaryNav } from "@/components/ui/SecondaryNav";

/** Second sidebar for every Customer Support page. */
export function SupportSubNav() {
  const pathname = usePathname();
  return <SecondaryNav label="Customer Support" title="Customer Support" items={SUPPORT_NAV.map((i) => ({ key: i.href, label: i.name, icon: i.icon, href: i.href, active: isSupportActive(pathname, i.href) }))} />;
}
