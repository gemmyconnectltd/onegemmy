import { ReportPreview } from "@/components/accounting/FinancialReports";
import { FinancialHeader, AccountingLinks } from "@/components/accounting/FinancialShared";
export default function Page() { return <div className="space-y-5"><FinancialHeader title="Accounts Payable" description="Supplier bills, outstanding balances and aging from the existing purchasing subledger." /><AccountingLinks /><ReportPreview kind="payables-aging" /></div>; }
