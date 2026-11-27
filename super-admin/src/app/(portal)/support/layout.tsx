"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ToastStack, useToasts } from "@/components/support/Toasts";
import { SecondaryNav, SectionLayout } from "@/components/ui/SecondaryNav";
import { SUPPORT_NAV, isSupportActive } from "@/components/shell/nav";
import { useSupportStream } from "@/lib/support/stream";
import { useSupportSummary } from "@/lib/support/hooks";
import { useAuth } from "@/lib/auth";
import { useEmailProblemSummary } from "@/lib/api/hooks";

// Shared Support shell: the second sidebar (Inbox, Tickets, Team, Settings), the live event stream and its
// notifications. Route protection comes from the (portal) layout above; the backend re-checks every call.
export default function SupportLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { toasts, dismiss, onEvent } = useToasts();
  useSupportStream(onEvent);
  const unread = useSupportSummary().data?.unread ?? 0;
  // Email problems is a platform-admin page (the backend requires a superadmin), so support-only staff don't see it.
  const supportOnly = useAuth().isSupportOnly();
  const problems = useEmailProblemSummary({ enabled: !supportOnly }).data?.open ?? 0;
  const counts: Record<string, number> = { "/support": unread, "/support/email-problems": problems };
  const items = SUPPORT_NAV.filter((i) => !(supportOnly && i.href === "/support/email-problems"))
    .map((i) => ({ key: i.href, label: i.name, icon: i.icon, href: i.href, active: isSupportActive(pathname, i.href), count: counts[i.href] > 0 ? counts[i.href] : undefined }));
  return (
    <>
      <SectionLayout nav={<SecondaryNav label="Customer Support" title="Customer Support" items={items} />}>{children}</SectionLayout>
      <ToastStack toasts={toasts} dismiss={dismiss} />
    </>
  );
}
