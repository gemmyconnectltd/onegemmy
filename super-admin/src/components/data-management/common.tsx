"use client";
import { Badge, type Tone } from "@/components/ui/Badge";
import type { DmStatus } from "@/lib/api";

export const STATUS_TONE: Record<DmStatus, Tone> = {
  Prepared: "slate", PendingApproval: "amber", Approved: "blue", Rejected: "red", Executing: "violet", Completed: "green", PartiallyCompleted: "amber", Failed: "red", Expired: "slate", Cancelled: "slate",
};
export const STATUS_LABEL: Record<DmStatus, string> = {
  Prepared: "Preview ready", PendingApproval: "Waiting for approval", Approved: "Approved", Rejected: "Rejected", Executing: "Running", Completed: "Completed", PartiallyCompleted: "Partly completed", Failed: "Failed", Expired: "Expired", Cancelled: "Cancelled",
};
export const StatusBadge = ({ status }: { status: DmStatus }) => <Badge tone={STATUS_TONE[status]} dot>{STATUS_LABEL[status]}</Badge>;

const BADGE_TONE: Record<string, Tone> = {
  completed: "green", paid: "green", approved: "green", active: "green", posted: "green", pending: "amber", draft: "slate", "awaiting approval": "amber", "partly paid": "amber", unpaid: "red",
  rejected: "red", cancelled: "red", "not required": "slate",
};

export function Cell({ kind, value, currency }: { kind: string; value: unknown; currency?: string }) {
  if (value === null || value === undefined || value === "") return <span className="text-muted">—</span>;
  if (kind === "money") return <span className="tabular-nums">{Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}{currency ? <span className="ml-1 text-[11px] text-muted">{currency}</span> : null}</span>;
  if (kind === "number") return <span className="tabular-nums">{Number(value).toLocaleString()}</span>;
  if (kind === "date") return <span className="whitespace-nowrap">{String(value).slice(0, 10)}</span>;
  if (kind === "datetime") return <span className="whitespace-nowrap">{new Date(String(value)).toLocaleString()}</span>;
  if (kind === "bool") return <Badge tone={value ? "green" : "slate"}>{value ? "Yes" : "No"}</Badge>;
  if (kind === "badge") return <Badge tone={BADGE_TONE[String(value).toLowerCase()] ?? "slate"}>{String(value)}</Badge>;
  if (kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={String(value).startsWith("http") ? String(value) : `${process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1$/, "") ?? "http://localhost:8000"}${value}`} alt="" className="h-8 w-8 rounded-md border border-border object-cover" />;
  }
  return <span className="inline-block max-w-[16rem] truncate align-bottom" title={String(value)}>{String(value)}</span>;
}

export const errorText = (e: unknown) => (e as { detail?: string; message?: string })?.detail ?? (e as { message?: string })?.message ?? "That didn't work. Please try again.";
