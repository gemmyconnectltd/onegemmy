import { ModuleLayout } from "@/components/dashboard/ModuleLayout";
import type { ReactNode } from "react";
export default function ServicesLayout({ children }: { children: ReactNode }) {
  return <ModuleLayout module="services">{children}</ModuleLayout>;
}
