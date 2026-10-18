import type { ReactNode } from "react";
import { SectionLayout } from "@/components/ui/SecondaryNav";
import { BillingSubNav } from "@/components/billing/SubNav";
export default function BillingLayout({ children }: { children: ReactNode }) {
  return <SectionLayout nav={<BillingSubNav />}>{children}</SectionLayout>;
}
