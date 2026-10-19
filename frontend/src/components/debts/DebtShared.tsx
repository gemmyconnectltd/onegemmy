"use client";

import { Users, Truck, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { formatMoney } from "@/lib/money";
import { useAppConfig } from "@/lib/appConfig";
import { BranchFilter } from "@/components/accounting/FinancialShared";
import type { DebtRecord } from "./types";

export function useDebtMoney() {
  const { currency } = useAppConfig();
  return (value: string, code = currency) => formatMoney(Number(value), code, { showCode: true });
}
export function DebtHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="mb-1 text-[11px] font-medium text-muted">Debt Management</p><h1 className="pesaa-page-title">{title}</h1><p className="mt-1 text-[13px] text-muted">{description}</p></div><div className="flex flex-wrap items-center gap-2"><div className="w-40"><BranchFilter /></div>{action}</div></header>;
}
export function DebtBadge({ record }: { record: Pick<DebtRecord, "status" | "is_overdue"> }) {
  const status = record.is_overdue ? "Overdue" : record.status;
  const color = status === "Overdue" ? "pesaa-badge-error" : status === "Paid" ? "pesaa-badge-success" : status === "PartiallyPaid" ? "pesaa-badge-warning" : "pesaa-badge-neutral";
  return <span className={`pesaa-badge ${color}`}><span className="h-1 w-1 rounded-full bg-current" />{status === "PartiallyPaid" ? "Partially Paid" : status}{record.is_overdue && record.status === "PartiallyPaid" && <span>· Partially Paid</span>}</span>;
}
export function DebtSummary({ items, currency }: { currency?: string; items: { label: string; value: string; overdue?: boolean }[] }) {
  const money = useDebtMoney();
  return <dl className={`grid gap-3 sm:grid-cols-2 ${items.length > 2 ? "xl:grid-cols-4" : ""}`}>{items.map((item, index) => {
    const Icon = item.overdue ? TriangleAlert : index === 1 ? Truck : Users;
    return <div key={item.label} className="flex min-w-0 items-center gap-4 rounded-xl border border-border bg-card p-5"><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${item.overdue ? "bg-red-500/10 text-red-500" : index === 1 ? "bg-orange-500/10 text-orange-500" : "bg-accent/10 text-accent"}`}><Icon size={25} strokeWidth={1.8} /></span><div className="min-w-0"><dt className="text-[11px] font-medium">{item.label}</dt><dd className="mt-1.5 break-words text-[20px] font-bold tracking-tight tabular-nums">{money(item.value, currency)}</dd></div></div>;
  })}</dl>;
}
export function debtDate(value: string | null) { return value ? new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value.slice(0, 10) + "T00:00:00Z")) : "No due date"; }
