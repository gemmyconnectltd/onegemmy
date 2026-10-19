import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "green" | "amber" | "red" | "blue" | "slate" | "violet";
export const TONES: Record<Tone, string> = {
  green: "pesaa-badge-success",
  amber: "pesaa-badge-warning",
  red: "pesaa-badge-error",
  blue: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  slate: "pesaa-badge-neutral",
  violet: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
};

/** The one status pill. Domain files map their own statuses to a label + tone and render this. */
export function Badge({ tone = "slate", dot, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: ReactNode }) {
  return (
    <span className={cn("pesaa-badge", TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}{children}
    </span>
  );
}
