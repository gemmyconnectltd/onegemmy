import { Suspense } from "react";
import { SalespeopleReport } from "@/components/reports/SalespeopleReport";
import { PageLoader } from "@/components/ui/PageLoader";

// Sales → Team performance: the same report as Business Reports → Team performance, served by the Sales API so sales staff
// without report access can use it (their own branches; without team access, only themselves).
export default function Page() {
  return <Suspense fallback={<PageLoader variant="page" />}><SalespeopleReport source="sales" /></Suspense>;
}
