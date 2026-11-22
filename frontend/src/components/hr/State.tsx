"use client";

import { LoadError } from "@/components/ui/LoadState";

export function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-muted py-12 text-center">{message}</p>;
}

/** Kept for its callers; renders the shared load-error block so every failed load looks and reads the same. */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <LoadError title="Could not load this page" error={message} onRetry={onRetry} />;
}

export const STATUS_COLORS: Record<string, string> = {
  Present: "bg-emerald-50 text-emerald-700",
  Late: "bg-amber-50 text-amber-700",
  Absent: "bg-red-50 text-red-600",
  "Half Day": "bg-blue-50 text-blue-700",
  Active: "bg-emerald-50 text-emerald-700",
  "On Leave": "bg-amber-50 text-amber-700",
  Terminated: "bg-red-50 text-red-600",
  Pending: "bg-amber-50 text-amber-700",
  Approved: "bg-emerald-50 text-emerald-700",
  Rejected: "bg-red-50 text-red-600",
  Paid: "bg-emerald-50 text-emerald-700",
  Screening: "bg-blue-50 text-blue-700",
  Interview: "bg-amber-50 text-amber-700",
  Offer: "bg-emerald-50 text-emerald-700",
  Hired: "bg-emerald-50 text-emerald-700",
  Applied: "bg-blue-50 text-blue-700",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`text-xs font-medium px-2 py-1 ${STATUS_COLORS[status] ?? "bg-surface text-muted"}`}>{status}</span>;
}
