import type { TicketStatus } from "@/lib/api/support";

export const STATUS_STYLE: Record<TicketStatus, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  in_progress: { label: "In progress", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  resolved: { label: "Resolved", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  closed: { label: "Closed", cls: "bg-slate-500/10 text-slate-600 dark:text-slate-300" },
};
