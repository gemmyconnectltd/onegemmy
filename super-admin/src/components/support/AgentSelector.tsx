"use client";

import { useSupport } from "@/lib/support/store";
import { cn } from "@/lib/utils";

const cls = "w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px] text-foreground outline-none focus:border-accent";

/** Native select (fully keyboard and screen-reader accessible) listing the support team. */
export function AgentSelector({ value, onChange, allowUnassigned = true, includeAll = false, className, label = "Assignee" }: {
  value: string | null | "all";
  onChange: (id: string | null | "all" | "unassigned") => void;
  allowUnassigned?: boolean;
  includeAll?: boolean;
  className?: string;
  label?: string;
}) {
  const { data } = useSupport();
  return (
    <select
      aria-label={label}
      className={cn(cls, className)}
      value={value === null ? "unassigned" : value}
      onChange={(e) => { const v = e.target.value; onChange(v === "unassigned" ? (includeAll ? "unassigned" : null) : v); }}
    >
      {includeAll && <option value="all">All agents</option>}
      {allowUnassigned && <option value="unassigned">Unassigned</option>}
      {data?.agents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.availability !== "online" ? ` (${a.availability})` : ""}</option>)}
    </select>
  );
}
