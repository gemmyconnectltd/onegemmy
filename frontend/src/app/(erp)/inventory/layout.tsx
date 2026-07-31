import { ModuleLayout } from "@/components/dashboard/ModuleLayout";
import type { ReactNode } from "react";
export default function InventoryLayout({ children }: { children: ReactNode }) {
  return <ModuleLayout module="inventory">{children}</ModuleLayout>;
}
