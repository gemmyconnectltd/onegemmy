import { Suspense } from "react";
import { SalespeopleReport } from "@/components/reports/SalespeopleReport";

export default function Page() {
  return <Suspense fallback={null}><SalespeopleReport /></Suspense>;
}
