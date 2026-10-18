import type { ReactNode } from "react";
import { AlertTriangle, Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({ icon: Icon = Inbox, title, description, hint, action }: { icon?: LucideIcon; title: string; description?: string; hint?: string; action?: ReactNode }) {
  const text = description ?? hint;
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-12 text-center">
      <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-accent/10 text-accent"><Icon size={20} /></span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {text && <p className="max-w-sm text-[12px] text-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
      <AlertTriangle size={15} className="flex-shrink-0" /> <span className="min-w-0 flex-1">{message}</span>
      {onRetry && <button type="button" onClick={onRetry} className="font-semibold underline">Retry</button>}
    </div>
  );
}

export function Notice({ tone = "amber", children }: { tone?: "amber" | "blue" | "red"; children: ReactNode }) {
  const c = { amber: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300", blue: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300", red: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300" }[tone];
  return <div role="note" className={cn("flex gap-2 rounded-lg border px-3 py-2 text-[12.5px]", c)}><AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /><div className="min-w-0">{children}</div></div>;
}
