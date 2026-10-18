import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "green" | "amber" | "red" | "blue" | "slate" | "violet";
export const TONES: Record<Tone, string> = {
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  red: "bg-red-500/10 text-red-700 dark:text-red-400",
  blue: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  slate: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  violet: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
};

/** The one status pill. Domain files map their own statuses to a label + tone and render this. */
export function Badge({ tone = "slate", dot, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}{children}
    </span>
  );
}
