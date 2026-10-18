"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DemoBanner } from "@/components/support/DemoBanner";
import { SupportSubNav } from "@/components/support/SubNav";
import { SectionLayout } from "@/components/ui/SecondaryNav";
import { SupportProvider } from "@/lib/support/store";

// Shared Support shell: one provider (so drafts, filters and demo edits survive moving between pages), the demo
// notice, and the second sidebar. Route protection comes from the (portal) layout above this one.
export default function SupportLayout({ children }: { children: ReactNode }) {
  // An open conversation gets the whole screen; its back arrow returns to the inbox.
  const inConversation = usePathname().startsWith("/support/conversations/");
  return (
    <SupportProvider>
      <div className="space-y-3">
        <DemoBanner />
        {inConversation ? children : <SectionLayout nav={<SupportSubNav />}>{children}</SectionLayout>}
      </div>
    </SupportProvider>
  );
}
