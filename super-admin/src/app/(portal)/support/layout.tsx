"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ToastStack, useToasts } from "@/components/support/Toasts";
import { SecondaryNav, SectionLayout } from "@/components/ui/SecondaryNav";
import { SUPPORT_NAV, isSupportActive } from "@/components/shell/nav";
import { useSupportStream } from "@/lib/support/stream";
import { useSupportSummary } from "@/lib/support/hooks";

// Shared Support shell: the second sidebar (Inbox, Tickets, Team, Settings), the live event stream and its
// notifications. Route protection comes from the (portal) layout above; the backend re-checks every call.
export default function SupportLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { toasts, dismiss, onEvent } = useToasts();
  useSupportStream(onEvent);
  const unread = useSupportSummary().data?.unread ?? 0;
  const items = SUPPORT_NAV.map((i) => ({ key: i.href, label: i.name, icon: i.icon, href: i.href, active: isSupportActive(pathname, i.href), count: i.href === "/support" && unread > 0 ? unread : undefined }));
  return (
    <>
      <SectionLayout nav={<SecondaryNav label="Customer Support" title="Customer Support" items={items} />}>{children}</SectionLayout>
      <ToastStack toasts={toasts} dismiss={dismiss} />
    </>
  );
}
