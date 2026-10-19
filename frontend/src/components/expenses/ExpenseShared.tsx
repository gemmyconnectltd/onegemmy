"use client";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useAppConfig } from "@/lib/appConfig";
import { formatMoney } from "@/lib/money";
import { BranchFilter } from "@/components/accounting/FinancialShared";
export const EXPENSE_METHODS = ["Cash", "Bank Transfer", "Mobile Money", "Card"];
export function useExpenseContext() {
  const { user, activeBranchId, hasPermission } = useAuth();
  const { currency } = useAppConfig();
  return { scope: `${user?.tenantId}:${activeBranchId ?? "all"}`, can: (action: string) => hasPermission(`expenses:${action}`), money: (amount: number | string, code = currency) => formatMoney(Number(amount), code, { showCode: true }), currency };
}
export function ExpenseHeader({ title, description, record = false, onRecord }: { title: string; description: string; record?: boolean; onRecord?: () => void }) {
  const { can } = useExpenseContext();
  return <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="mb-1 text-[11px] text-muted">Expense Management</p><h1 className="pesaa-page-title">{title}</h1><p className="mt-1 text-[13px] text-muted">{description}</p></div><div className="flex flex-wrap gap-2"><div className="w-40"><BranchFilter /></div>{record && can("create") && (onRecord ? <Button onClick={onRecord}><Plus size={15} />Record Expense</Button> : <Link href="/expenses/list?create=1" className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white"><Plus size={15} />Record Expense</Link>)}</div></header>;
}
export function ExpenseDenied() { return <p role="alert" className="rounded-xl border border-border bg-card p-5 text-sm text-muted">You don’t have permission to view expenses.</p>; }
