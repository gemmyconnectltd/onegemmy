"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ModuleLayout } from "@/components/dashboard/ModuleLayout";

// Financial Reports lives under Insights in the main sidebar, so it opens full width without the Accounting sidebar.
export default function AccountingLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/accounting/reports" || pathname.startsWith("/accounting/reports/")) return <>{children}</>;
  return <ModuleLayout module="accounting">{children}</ModuleLayout>;
}
