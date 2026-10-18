"use client";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useFinancialRecords, useCashPosition } from "@/lib/api/hooks";
import { useFinancialMoney } from "./FinancialShared";
export function CashBalanceWarning({ accountId, paymentAmount }: { accountId?: string; paymentAmount?: string }) {
  const { activeBranchId, hasPermission } = useAuth();
  const q = useFinancialRecords("cash", 1, undefined, activeBranchId, hasPermission("banking:read") && !accountId);
  const position = useCashPosition(accountId, activeBranchId, hasPermission("banking:read"));
  const fmt = useFinancialMoney();
  const rows = accountId ? position.data && !position.isPlaceholderData ? [position.data] : [] : q.data?.negative_accounts ?? [];
  const warnings = rows.filter(row => Number(row.balance) - Number(paymentAmount || 0) < 0);
  if (!warnings.length) return null;
  return <div role="alert" className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-200"><AlertTriangle size={17} className="shrink-0" /><div><p className="font-semibold">Insufficient recorded funds — review before posting a payment.</p>{warnings.map(row => <p key={String(row.id)} className="mt-1">{String(row.name)}: {fmt(String(row.balance))}{paymentAmount ? `; after this payment: ${fmt(Number(row.balance) - Number(paymentAmount))}` : ". A negative cash balance requires reconciliation, funding or correction of its source entries."}</p>)}{!accountId && Number(q.data?.negative_count) > rows.length && <p className="mt-1">{q.data?.negative_count} cash-equivalent accounts have negative balances. Review all accounts in Cash & Bank.</p>}</div></div>;
}
