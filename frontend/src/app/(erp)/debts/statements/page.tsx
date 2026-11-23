import { Suspense } from "react";
import { DebtStatementScreen } from "@/components/debts/DebtStatement";
import { PageLoader } from "@/components/ui/PageLoader";
export default function Page() { return <Suspense fallback={<PageLoader variant="page" />}><DebtStatementScreen /></Suspense>; }
