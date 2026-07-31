import { ModuleLayout } from "@/components/dashboard/ModuleLayout";
import type { ReactNode } from "react";
export default function CRMLayout({ children }: { children: ReactNode }) {
  return <ModuleLayout module="crm">{children}</ModuleLayout>;
}
