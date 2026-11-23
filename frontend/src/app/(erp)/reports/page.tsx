import { Suspense } from "react";
import { PerformanceOverview } from "@/components/reports/PerformanceOverview";
import { PageLoader } from "@/components/ui/PageLoader";

export default function ReportsPage() {
  return <Suspense fallback={<PageLoader variant="page" />}><PerformanceOverview /></Suspense>;
}
