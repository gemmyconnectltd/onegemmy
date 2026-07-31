import { ModuleLayout } from "@/components/dashboard/ModuleLayout";
import type { ReactNode } from "react";
export default function CustomersLayout({ children }: { children: ReactNode }) {
  return <ModuleLayout module="customers">{children}</ModuleLayout>;
}
