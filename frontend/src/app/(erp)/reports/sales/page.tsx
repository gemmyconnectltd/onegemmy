import { Suspense } from "react";
import { SalesProfitability } from "@/components/reports/SalesProfitability";

export default function Page() {
  return <Suspense fallback={null}><SalesProfitability /></Suspense>;
}
