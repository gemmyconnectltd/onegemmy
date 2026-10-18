"use client";

import type { ReactNode } from "react";
import { BillingDemoBanner } from "@/components/billing/DemoBanner";
import { SectionLayout } from "@/components/ui/SecondaryNav";
import { BillingSubNav } from "@/components/billing/SubNav";
import { BillingProvider, useBilling } from "@/lib/billing/store";
import { PageLoader } from "@/components/ui/PageLoader";
import { ErrorState } from "@/components/billing/ui";

function Gate({ children }: { children: ReactNode }) {
  const { status, actions } = useBilling();
  if (status === "loading") return <PageLoader variant="compact" />;
  if (status === "error") return <ErrorState message="Couldn't load billing data." onRetry={actions.reload} />;
  return <>{children}</>;
}

// Shared billing shell: one provider (so edits survive moving between pages), the demo notice, and the tab strip.
// Route protection comes from the (portal) layout above this one.
export default function BillingLayout({ children }: { children: ReactNode }) {
  return (
    <BillingProvider>
      <div className="space-y-4">
        <BillingDemoBanner />
        <SectionLayout nav={<BillingSubNav />}><Gate>{children}</Gate></SectionLayout>
      </div>
    </BillingProvider>
  );
}
