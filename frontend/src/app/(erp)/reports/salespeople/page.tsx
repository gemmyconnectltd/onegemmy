import { Suspense } from "react";
import { SalespeopleReport } from "@/components/reports/SalespeopleReport";
import { PageLoader } from "@/components/ui/PageLoader";

export default function Page() {
  return <Suspense fallback={<PageLoader variant="page" />}><SalespeopleReport /></Suspense>;
}
