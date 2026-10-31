import { Suspense } from "react";
import { OperationsReport } from "@/components/reports/OperationsReport";

export default function Page() {
  return <Suspense fallback={null}><OperationsReport /></Suspense>;
}
