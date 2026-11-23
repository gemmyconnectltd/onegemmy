import { Suspense } from "react";
import { CustomersReport } from "@/components/reports/OperationsReport";
import { PageLoader } from "@/components/ui/PageLoader";

export default function Page() {
  return <Suspense fallback={<PageLoader variant="page" />}><CustomersReport /></Suspense>;
}
