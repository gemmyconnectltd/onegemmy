import { Suspense } from "react";
import { FinancialSummary } from "@/components/reports/FinancialSummary";

export default function Page() {
  return <Suspense fallback={null}><FinancialSummary /></Suspense>;
}
