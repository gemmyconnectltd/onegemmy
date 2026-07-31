import { ModuleLayout } from "@/components/dashboard/ModuleLayout";
import type { ReactNode } from "react";
export default function ManufacturingLayout({ children }: { children: ReactNode }) {
  return <ModuleLayout module="manufacturing">{children}</ModuleLayout>;
}
