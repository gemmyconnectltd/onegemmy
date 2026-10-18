"use client";

// Shared primitives live in components/ui; this file only adds billing's status vocabulary and date format.
import { Badge as BaseBadge, type Tone } from "@/components/ui/Badge";

export { PageHeader } from "@/components/ui/PageHeader";
export { Metric } from "@/components/ui/Metric";
export { EmptyState, ErrorState, Notice } from "@/components/ui/EmptyState";
export { SearchBox, Pagination, usePaged, SortHeader } from "@/components/ui/DataTable";

const MAP: Record<string, [string, Tone]> = {
  active: ["Active", "green"], draft: ["Draft", "slate"], archived: ["Archived", "slate"],
  trialing: ["Trial", "blue"], past_due: ["Past due", "red"], canceled: ["Canceled", "slate"],
  paid: ["Paid", "green"], unpaid: ["Unpaid", "amber"], failed: ["Failed", "red"], none: ["—", "slate"],
  pending: ["Pending", "amber"], processing: ["Processing", "blue"], succeeded: ["Succeeded", "green"], refunded: ["Refunded", "violet"],
  open: ["Open", "amber"], void: ["Void", "slate"], uncollectible: ["Uncollectible", "red"],
};

/** One pill for every billing status, so a color means the same thing on every billing screen. */
export function Badge({ value, label, tone, className }: { value?: string; label?: string; tone?: Tone; className?: string }) {
  const [l, t] = (value && MAP[value]) || [label ?? value ?? "", "slate" as Tone];
  return <BaseBadge tone={tone ?? t} className={className}>{label ?? l}</BaseBadge>;
}

export const fmtDate = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" }) : "—");
