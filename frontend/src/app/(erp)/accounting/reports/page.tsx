import { Suspense } from "react";
import { FinancialReportsWorkspace } from "@/components/accounting/FinancialReports";
import { PageLoader } from "@/components/ui/PageLoader";
export default function Page() { return <Suspense fallback={<PageLoader variant="page" />}><FinancialReportsWorkspace /></Suspense>; }
