"use client";

import { usePathname } from "next/navigation";
import { Megaphone } from "lucide-react";
import type { ReactNode } from "react";
import { SecondaryNav, SectionLayout } from "@/components/ui/SecondaryNav";
import { MARKETING_NAV, isMarketingActive } from "@/components/shell/nav";

// Shared Marketing shell: the second sidebar with the eight Marketing pages. Route protection comes from the (portal)
// layout above; the backend re-checks every call.
export default function MarketingLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const items = MARKETING_NAV.map((i) => ({ key: i.href, label: i.name, icon: i.icon, href: i.href, active: isMarketingActive(pathname, i.href) }));
  return <SectionLayout nav={<SecondaryNav label="Marketing" title="Marketing" subtitle="Audience, email & automation" icon={Megaphone} items={items} />}>{children}</SectionLayout>;
}
