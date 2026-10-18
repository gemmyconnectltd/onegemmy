"use client";

import type { ReactNode } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/** Label (and optional hint) on the left, the control on the right; stacks on phones or when `stack` is set. */
export function SettingRow({ label, hint, children, stack }: { label: string; hint?: string; children: ReactNode; stack?: boolean }) {
  return (
    <div className={cn("flex gap-x-6 gap-y-2 border-b border-border py-3.5 last:border-0", stack ? "flex-col" : "flex-col sm:flex-row sm:items-center sm:justify-between")}>
      <div className="min-w-0 sm:max-w-md"><p className="text-sm font-medium text-foreground">{label}</p>{hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}</div>
      <div className={cn("min-w-0", !stack && "sm:flex-shrink-0")}>{children}</div>
    </div>
  );
}

/** The one Save action of a section: disabled until something changed, with progress and result feedback. */
export function SaveBar({ dirty, invalid, saving, saved, error, onSave, label = "Save changes" }: { dirty: boolean; invalid?: boolean; saving: boolean; saved: boolean; error: string | null; onSave: () => void; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-4">
      <Button type="button" variant="primary" onClick={onSave} disabled={!dirty || invalid || saving} className="rounded-lg text-[13px]">{saving && <Loader2 size={13} className="animate-spin" />}{saving ? "Saving…" : label}</Button>
      {invalid && dirty && <span className="text-[12px] text-red-600 dark:text-red-400">Fix the highlighted values first.</span>}
      {saved && !dirty && <span role="status" className="flex items-center gap-1 text-[12px] font-medium text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={13} /> Saved</span>}
      {error && <span role="alert" className="text-[12px] font-medium text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}

/** For settings the platform has no backend for yet: shown honestly instead of as a control that does nothing. */
export function NotAvailable({ label, hint }: { label: string; hint?: string }) {
  return (
    <SettingRow label={label} hint={hint}>
      <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted">Not available yet</span>
    </SettingRow>
  );
}
