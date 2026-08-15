"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

export function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-muted py-12 text-center">{message}</p>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-card border border-border rounded-xl py-12 px-6 text-center space-y-3">
      <AlertTriangle size={22} className="mx-auto text-red-500" />
      <p className="text-sm font-semibold text-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-border bg-surface text-sm font-semibold text-foreground hover:bg-surface/70"
      >
        <RefreshCw size={14} /> Retry
      </button>
    </div>
  );
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
