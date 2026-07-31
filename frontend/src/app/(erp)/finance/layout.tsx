import { ModuleLayout } from "@/components/dashboard/ModuleLayout";
import type { ReactNode } from "react";
export default function FinanceLayout({ children }: { children: ReactNode }) {
  return <ModuleLayout module="finance">{children}</ModuleLayout>;
}
