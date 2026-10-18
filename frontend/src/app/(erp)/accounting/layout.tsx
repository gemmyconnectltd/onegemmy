import { ModuleLayout } from "@/components/dashboard/ModuleLayout";
import { AccountingNavigation } from "@/components/accounting/AccountingNavigation";
import type { ReactNode } from "react";
export default function AccountingLayout({ children }: { children: ReactNode }) {
  return <ModuleLayout module="accounting" renderNav={<AccountingNavigation />}>{children}</ModuleLayout>;
}
