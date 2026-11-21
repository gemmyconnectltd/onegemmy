import { Suspense } from "react";
import { StockReport } from "@/components/reports/OperationsReport";

export default function Page() {
  return <Suspense fallback={null}><StockReport /></Suspense>;
}
