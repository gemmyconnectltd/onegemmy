import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Compact KPI tile. With `icon` it shows a tinted icon chip beside the value; without, label above value. */
export function Metric({ label, value, sub, icon: Icon, tone = "bg-accent/10 text-accent" }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ElementType; tone?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-3.5">
      {Icon && <span className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl", tone)}><Icon size={16} /></span>}
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
        <div className="truncate text-xl font-extrabold leading-tight text-foreground">{typeof value === "number" ? value.toLocaleString() : value}</div>
        {sub && <p className="truncate text-[10.5px] text-muted">{sub}</p>}
      </div>
    </div>
  );
}
