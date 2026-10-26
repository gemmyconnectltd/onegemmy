import type { ReactNode } from "react";
import { ModuleLayout } from "@/components/dashboard/ModuleLayout";
import "./debts.css";

export default function DebtLayout({ children }: { children: ReactNode }) {
  return <ModuleLayout module="debts">{children}</ModuleLayout>;
}
