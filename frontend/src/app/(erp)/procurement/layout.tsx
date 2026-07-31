import { ModuleLayout } from "@/components/dashboard/ModuleLayout";
import type { ReactNode } from "react";
export default function ProcurementLayout({ children }: { children: ReactNode }) {
  return <ModuleLayout module="procurement">{children}</ModuleLayout>;
}
