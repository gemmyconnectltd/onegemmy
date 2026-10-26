export type DebtKind = "receivable" | "payable";
export type DebtStatus = "Unpaid" | "PartiallyPaid" | "Paid" | "WrittenOff";
export interface DebtRecord {
  id: string;
  kind: DebtKind;
  name: string;
  reference: string;
  original: string;
  paid: string;
  outstanding: string;
  currency: string;
  issue_date: string | null;
  due_date: string | null;
  status: DebtStatus;
  is_overdue: boolean;
  written_off?: string;
  is_manual?: boolean;
  party_id?: string | null;
}
export const AGING_BUCKETS = ["0-30", "31-60", "61-90", "90+"] as const;
export type Aging = Record<(typeof AGING_BUCKETS)[number], string>;
export interface DebtSummaryTotals { outstanding: string; overdue: string; total?: number; aging: Aging }
export interface StatementRow { date: string; type: "invoice" | "payment" | "write_off"; reference: string; description: string; debit: string; credit: string; balance: string }
export interface DebtStatementData {
  kind: DebtKind; currency: string; date_from: string; date_to: string; opening: string; closing: string;
  party: { id: string; name: string; email: string | null };
  rows: StatementRow[]; totals: { billed: string; paid: string; written_off: string; outstanding: string }; aging: Aging;
}
export interface ManualDebtInput { party_id: string; branch_id?: string; amount: string; issue_date: string; due_date?: string; reference?: string; notes?: string }
export interface DebtEditInput { due_date?: string | null; notes?: string | null; reference?: string }
export function reasonError(value: string): string | null { return value.trim().length < 3 ? "Enter a reason (at least 3 characters)." : null; }
export interface DebtFilters {
  page: number;
  search: string;
  status: "all" | DebtStatus | "Overdue";
  due_from: string;
  due_to: string;
}
// Decimal string validation avoids floating-point rounding in payment comparisons.
export function minorUnits(value: string): bigint | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}
export function paymentError(amount: string, outstanding: string): string | null {
  const entered = minorUnits(amount);
  const balance = minorUnits(outstanding);
  if (entered === null || entered <= BigInt(0)) return "Enter a positive amount with up to two decimal places.";
  if (balance === null) return "The balance could not be verified. Refresh this record before paying.";
  if (entered > balance) return "The payment cannot exceed the outstanding balance.";
  return null;
}

export interface DebtPaymentInput { amount: string; payment_method: string; paid_at: string; reference_number: string; notes: string; client_payment_id: string }
export interface DebtPayment { id: string; reference: string; display_reference?: string; reference_number?: string | null; amount: string; currency: string; payment_method: string | null; paid_at: string; status: string; actor: string | null; notes: string | null }
