import { Suspense } from "react";
import { PurchasesReport } from "@/components/reports/OperationsReport";

export default function Page() {
  return <Suspense fallback={null}><PurchasesReport /></Suspense>;
}
