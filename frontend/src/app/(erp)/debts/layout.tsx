import type { ReactNode } from "react";
import { ModuleLayout } from "@/components/dashboard/ModuleLayout";
import { DebtNavigation } from "@/components/debts/DebtNavigation";
import "./debts.css";

export default function DebtLayout({ children }: { children: ReactNode }) {
  return <ModuleLayout renderNav={<DebtNavigation />}>{children}</ModuleLayout>;
}
