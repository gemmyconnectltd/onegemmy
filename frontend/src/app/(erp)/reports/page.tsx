import { Suspense } from "react";
import { PerformanceOverview } from "@/components/reports/PerformanceOverview";

export default function ReportsPage() {
  return <Suspense fallback={null}><PerformanceOverview /></Suspense>;
}
