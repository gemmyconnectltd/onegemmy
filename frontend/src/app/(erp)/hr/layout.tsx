import { ModuleLayout } from "@/components/dashboard/ModuleLayout";
import type { ReactNode } from "react";
export default function HRLayout({ children }: { children: ReactNode }) {
  return <ModuleLayout module="hr">{children}</ModuleLayout>;
}
