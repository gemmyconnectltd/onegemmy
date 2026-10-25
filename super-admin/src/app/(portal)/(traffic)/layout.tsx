"use client";

import { usePathname } from "next/navigation";
import { Gauge } from "lucide-react";
import type { ReactNode } from "react";
import { SecondaryNav, SectionLayout } from "@/components/ui/SecondaryNav";
import { TRAFFIC_NAV, isTrafficActive } from "@/components/shell/nav";

// Shared Traffic shell: one second sidebar for Website Traffic and ERP Traffic, each with its detail pages. The route
// group "(traffic)" only shares this layout — the URLs (/traffic, /erp-traffic …) are unchanged.
export default function TrafficLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const items = TRAFFIC_NAV.map((i) => ({ key: i.href, group: i.group, label: i.name, icon: i.icon, href: i.href, active: isTrafficActive(pathname, i.href) }));
  return <SectionLayout nav={<SecondaryNav label="Traffic" title="Traffic" subtitle="Website and ERP usage" icon={Gauge} items={items} />}>{children}</SectionLayout>;
}
