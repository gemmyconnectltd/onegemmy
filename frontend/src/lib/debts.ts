export type DebtKind = "receivable" | "payable";
export type DebtStatus = "Unpaid" | "PartiallyPaid" | "Paid";
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
}
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
