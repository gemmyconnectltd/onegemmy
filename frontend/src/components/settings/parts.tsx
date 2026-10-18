"use client";

import type { ReactNode } from "react";
import { CheckCircle2, Loader2, Save, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/** One titled card of settings. Rows inside are separated by hairlines; no nested cards. */
export function SettingsCard({ title, description, children, className, icon: Icon }: { icon?: LucideIcon; title: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-xl border border-border bg-card", className)}>
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
        {Icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><Icon size={16} /></span>}
        <div className="min-w-0">
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{description}</p>}
        </div>
      </div>
      <div className="px-4 py-1 sm:px-5">{children}</div>
    </section>
  );
}

/** Label (+hint) on the left, control on the right; stacks on phones. */
export function SettingRow({ label, hint, children, stack }: { label: string; hint?: string; children: ReactNode; stack?: boolean }) {
  return (
    <div className={cn("flex gap-x-6 gap-y-2 border-b border-border py-3.5 last:border-0", stack ? "flex-col" : "flex-col sm:flex-row sm:items-center sm:justify-between")}>
      <div className="min-w-0 sm:max-w-sm"><p className="text-sm font-medium text-foreground">{label}</p>{hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}</div>
      <div className={cn("min-w-0", !stack && "sm:flex-shrink-0")}>{children}</div>
    </div>
  );
}

/** For settings the platform has no backend for yet: shown honestly instead of as a control that only looks like it works. */
export function NotAvailable({ label, hint }: { label: string; hint?: string }) {
  return (
    <SettingRow label={label} hint={hint}>
      <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted">Not available yet</span>
    </SettingRow>
  );
}

/** The one Save action of a form: disabled until something changed, with progress and result feedback. */
export function SaveBar({ dirty, invalid, saving, saved, error, onSave, onReset, label = "Save changes" }: { dirty: boolean; invalid?: boolean; saving: boolean; saved: boolean; error: string | null; onSave: () => void; onReset?: () => void; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border bg-card px-4 py-3 sm:px-5">
      <Button type="button" onClick={onSave} disabled={!dirty || invalid || saving} variant="primary">{saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={14} />}{saving ? "Saving…" : label}</Button>
      {onReset && dirty && !saving && <Button type="button" variant="ghost" onClick={onReset}>Discard</Button>}
      {saved && <span role="status" className="flex items-center gap-1 text-[12px] font-medium text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={13} /> Saved</span>}
      {error && <span role="alert" className="text-[12px] font-medium text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
