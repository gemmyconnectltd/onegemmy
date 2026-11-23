import { Suspense } from "react";
import { StockReport } from "@/components/reports/OperationsReport";
import { PageLoader } from "@/components/ui/PageLoader";

export default function Page() {
  return <Suspense fallback={<PageLoader variant="page" />}><StockReport /></Suspense>;
}
