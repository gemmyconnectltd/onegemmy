import { Suspense } from "react";
import { FinancialSummary } from "@/components/reports/FinancialSummary";
import { PageLoader } from "@/components/ui/PageLoader";

export default function Page() {
  return <Suspense fallback={<PageLoader variant="page" />}><FinancialSummary /></Suspense>;
}
