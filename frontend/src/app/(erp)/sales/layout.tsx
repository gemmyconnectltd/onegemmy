"use client";

import { usePathname } from "next/navigation";
import { ModuleLayout } from "@/components/dashboard/ModuleLayout";
import type { ReactNode } from "react";
export default function SalesLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/sales/discounts" || pathname.startsWith("/sales/discounts/")) return <>{children}</>;
  return <ModuleLayout module="sales">{children}</ModuleLayout>;
}
