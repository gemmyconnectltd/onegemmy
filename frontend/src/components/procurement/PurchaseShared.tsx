"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import type { PurchaseOrder } from "@/lib/api";

export function usePurchasingScope() {
  const {user, activeBranchId} = useAuth();
  return `${user?.tenantId}:${activeBranchId}`;
}
export function PurchaseHeader({title, description, actions}: {title: string; description: string; actions?: ReactNode}) {
  return <header className="flex flex-wrap items-start justify-between gap-3"><div><Link href="/procurement" className="text-xs text-muted hover:text-accent">Purchases</Link><h1 className="pesaa-page-title mt-1">{title}</h1><p className="mt-1 text-sm text-muted">{description}</p></div><div className="flex flex-wrap gap-2">{actions}</div></header>;
}
export function PurchaseStatus({status}: {status: string}) {
  const tone = ["Received", "Paid", "Closed", "Approved"].includes(status) ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : ["Cancelled", "Overdue"].includes(status) ? "bg-red-500/10 text-red-600 dark:text-red-400" : ["PendingApproval", "PartiallyReceived", "PartiallyPaid", "Sent"].includes(status) ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-surface text-muted";
  const label = status.replace(/([a-z])([A-Z])/g, "$1 $2");
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${tone}`}>{label}</span>;
}
export function receivingStatus(order: PurchaseOrder) {
  const quantities = order.items.map(item => Number(item.received_quantity ?? (order.status === "Received" ? item.quantity : 0)));
  return quantities.every((quantity, index) => quantity >= order.items[index].quantity) ? "Fully received" : quantities.some(quantity => quantity > 0) ? "Partially received" : "Not received";
}
