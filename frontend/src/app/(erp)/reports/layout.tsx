import { ModuleLayout } from "@/components/dashboard/ModuleLayout";
import type { ReactNode } from "react";
export default function ReportsLayout({ children }: { children: ReactNode }) {
  return <ModuleLayout module="reports">{children}</ModuleLayout>;
}
