import { ModuleLayout } from "@/components/dashboard/ModuleLayout";
import type { ReactNode } from "react";
export default function ExpenseLayout({ children }: { children: ReactNode }) {
  return <ModuleLayout module="expenses">{children}</ModuleLayout>;
}
