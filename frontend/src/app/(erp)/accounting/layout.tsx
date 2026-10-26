import { ModuleLayout } from "@/components/dashboard/ModuleLayout";
import type { ReactNode } from "react";
export default function AccountingLayout({ children }: { children: ReactNode }) {
  return <ModuleLayout module="accounting">{children}</ModuleLayout>;
}
