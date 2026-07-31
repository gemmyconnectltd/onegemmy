import { ModuleLayout } from "@/components/dashboard/ModuleLayout";
import type { ReactNode } from "react";
export default function SalesLayout({ children }: { children: ReactNode }) {
  return <ModuleLayout module="sales">{children}</ModuleLayout>;
}
