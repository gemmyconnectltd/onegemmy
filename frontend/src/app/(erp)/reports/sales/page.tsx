import { Suspense } from "react";
import { SalesProfitability } from "@/components/reports/SalesProfitability";
import { PageLoader } from "@/components/ui/PageLoader";

export default function Page() {
  return <Suspense fallback={<PageLoader variant="page" />}><SalesProfitability /></Suspense>;
}
