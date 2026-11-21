import { Suspense } from "react";
import { CustomersReport } from "@/components/reports/OperationsReport";

export default function Page() {
  return <Suspense fallback={null}><CustomersReport /></Suspense>;
}
