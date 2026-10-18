import { ReportPreview } from "@/components/accounting/FinancialReports";
import { FinancialHeader, AccountingLinks } from "@/components/accounting/FinancialShared";
export default function Page() { return <div className="space-y-5"><FinancialHeader title="Accounts Receivable" description="Customer invoices, outstanding balances and aging from the existing sales subledger." /><AccountingLinks /><ReportPreview kind="receivables-aging" /></div>; }
