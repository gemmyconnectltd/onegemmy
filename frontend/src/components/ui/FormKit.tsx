"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, FileText, Loader2, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { currencyDecimals } from "@/lib/money";
import { groupThousands, padAmount, sanitizeAmount } from "@/lib/moneyInput";

/* The PESAA form kit. It builds on Field / Input / Select / Textarea (components/ui/Form), Drawer and SearchSelect:
   a form is sections of fields, one error summary, one action bar. See docs/FORMS.md. */

/** A titled group of related fields on a form page or in a drawer. */
export function FormSection({ title, description, children, columns = 2, className = "", variant = "card" }: {
  title: string; description?: string; children: ReactNode; columns?: 1 | 2 | 3; className?: string; variant?: "card" | "plain";
}) {
  // Columns follow the width of the container (a drawer is narrow whatever the screen is), not the width of the browser window.
  const grid = columns === 3 ? "@md:grid-cols-2 @2xl:grid-cols-3" : columns === 2 ? "@md:grid-cols-2" : "";
  return (
    <section className={`@container space-y-3 ${variant === "card" ? "rounded-xl border border-border bg-card p-4 sm:p-5" : ""} ${className}`}>
      <div><h2 className={variant === "card" ? "pesaa-card-title" : "text-[13px] font-semibold"}>{title}</h2>{description && <p className="mt-0.5 text-xs text-muted">{description}</p>}</div>
      <div className={`grid grid-cols-1 gap-x-4 gap-y-3 ${grid}`}>{children}</div>
    </section>
  );
}

/** Lets one field take the whole row inside a FormSection grid. */
export function FormRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`min-w-0 @md:col-span-full ${className}`}>{children}</div>;
}

/** What went wrong, in one place at the top of the form. Takes focus when it appears so keyboard and screen-reader users land on it. */
export function FormErrorSummary({ errors, title = "Please fix the following" }: { errors: string[] | string | null | undefined; title?: string }) {
  const list = (Array.isArray(errors) ? errors : errors ? [errors] : []).filter(Boolean);
  const ref = useRef<HTMLDivElement>(null);
  const key = list.join("|");
  useEffect(() => { if (key) ref.current?.focus({ preventScroll: false }); }, [key]);
  if (!list.length) return null;
  return (
    <div ref={ref} role="alert" tabIndex={-1} className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2.5 text-sm outline-none">
      <p className="flex items-center gap-1.5 font-semibold text-red-700 dark:text-red-400"><AlertCircle size={15} aria-hidden />{list.length > 1 ? title : list[0]}</p>
      {list.length > 1 && <ul className="mt-1 list-disc space-y-0.5 pl-6 text-xs text-red-700 dark:text-red-400">{list.map((item) => <li key={item}>{item}</li>)}</ul>}
    </div>
  );
}

/** Cancel | primary. The primary action shows progress and cannot be pressed twice. `sticky` pins it to the bottom of the scrolling page. */
export function FormActions({ onCancel, submitLabel = "Save", busyLabel = "Saving…", busy = false, disabled = false, cancelLabel = "Cancel", sticky = false, children }: {
  onCancel?: () => void; submitLabel?: string; busyLabel?: string; busy?: boolean; disabled?: boolean; cancelLabel?: string; sticky?: boolean; children?: ReactNode;
}) {
  return (
    <div className={`flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4 ${sticky ? "sticky bottom-0 z-10 -mx-1 bg-card/95 px-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur" : ""}`}>
      {children}
      {onCancel && <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{cancelLabel}</Button>}
      <Button type="submit" disabled={busy || disabled} aria-busy={busy}>{busy && <Loader2 size={14} className="animate-spin" aria-hidden />}{busy ? busyLabel : submitLabel}</Button>
    </div>
  );
}

/** A full-page form: breadcrumb, title, the form, and an optional summary beside it on wide screens (below it on phones). */
export function FormPage({ breadcrumb, title, description, summary, children }: {
  breadcrumb?: { label: string; href?: string }[]; title: string; description?: string; summary?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <header>
        {breadcrumb && <nav aria-label="Breadcrumb" className="mb-1 flex flex-wrap items-center gap-1 text-xs text-muted">{breadcrumb.map((item, i) => <span key={item.label} className="flex items-center gap-1">{i > 0 && <span aria-hidden>›</span>}{item.href ? <Link href={item.href} className="hover:text-foreground">{item.label}</Link> : <span className="font-medium text-foreground">{item.label}</span>}</span>)}</nav>}
        <h1 className="pesaa-page-title">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </header>
      <div className={summary ? "grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]" : ""}>
        <div className="min-w-0 space-y-4">{children}</div>
        {summary && <aside className="space-y-3 rounded-xl border border-border bg-card p-4 xl:sticky xl:top-16">{summary}</aside>}
      </div>
    </div>
  );
}

/** Moves keyboard focus to the first field the browser marked invalid, so a failed Save never leaves the person hunting for the problem. */
export function focusFirstInvalid(form: HTMLFormElement | null): boolean {
  const target = form?.querySelector<HTMLElement>(":invalid, [aria-invalid='true']");
  if (!target) return false;
  target.scrollIntoView({ block: "center", behavior: "smooth" });
  target.focus({ preventScroll: true });
  return true;
}

/** An amount in a currency: typed as plain digits (no separators to fight), at most the currency's decimals, padded on leaving the field,
 *  with the grouped figure shown underneath. The value is a string and is never converted through floating point. */
export function MoneyField({ label, value, onChange, currency, required, hint, disabled, placeholder, className, id, "aria-label": ariaLabel }: {
  label?: string; value: string; onChange: (value: string) => void; currency: string; required?: boolean; hint?: string; disabled?: boolean;
  placeholder?: string; className?: string; id?: string; "aria-label"?: string;
}) {
  const decimals = currencyDecimals(currency);
  return (
    <Field label={label ?? `Amount (${currency})`} required={required} hint={hint} className={className}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted" aria-hidden>{currency}</span>
        <Input id={id} aria-label={ariaLabel} inputMode={decimals > 0 ? "decimal" : "numeric"} autoComplete="off" required={required} disabled={disabled} placeholder={placeholder ?? (decimals > 0 ? `0.${"0".repeat(decimals)}` : "0")}
          className="pl-12 text-right tabular-nums" value={value} onChange={(e) => onChange(sanitizeAmount(e.target.value, decimals))} onBlur={() => onChange(padAmount(value, decimals))} />
      </div>
      {value && Number(value) > 0 && <p className="mt-1 text-right text-[11px] tabular-nums text-muted" aria-live="polite">{currency} {groupThousands(value)}</p>}
    </Field>
  );
}

/** One upload experience: click or drag, type and size checks with a clear message, a list with Remove. Works for new files and shows existing ones in edit mode. */
export function FileDropzone({ label = "Attachments", files, onChange, accept = ["application/pdf", "image/png", "image/jpeg"], maxFiles = 10, maxSizeMB = 5, existing, hint, disabled }: {
  label?: string; files: File[]; onChange: (files: File[]) => void; accept?: string[]; maxFiles?: number; maxSizeMB?: number; existing?: string[]; hint?: string; disabled?: boolean;
}) {
  const [problem, setProblem] = useState("");
  const [over, setOver] = useState(false);
  const kinds = accept.map((type) => type.split("/")[1].toUpperCase().replace("JPEG", "JPEG")).join(", ");
  const take = (incoming: File[]) => {
    const next = [...files, ...incoming];
    if (next.length > maxFiles) { setProblem(`Choose up to ${maxFiles} file${maxFiles === 1 ? "" : "s"}.`); return; }
    const bad = incoming.find((file) => !accept.includes(file.type));
    if (bad) { setProblem(`${bad.name} is not an accepted type (${kinds}).`); return; }
    const big = incoming.find((file) => file.size > maxSizeMB * 1024 * 1024);
    if (big) { setProblem(`${big.name} is larger than ${maxSizeMB} MB.`); return; }
    setProblem(""); onChange(next);
  };
  return (
    <div>
      <span className="mb-1 block text-[13px] font-medium">{label}</span>
      <label onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) take(Array.from(e.dataTransfer.files)); }}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-4 text-center text-sm text-muted focus-within:border-accent hover:border-accent ${over ? "border-accent bg-accent/5" : "border-border bg-surface/40"} ${disabled ? "pointer-events-none opacity-60" : ""}`}>
        <UploadCloud size={20} aria-hidden /><span>Drag and drop here, or <span className="font-medium text-accent">click to browse</span></span>
        <span className="text-xs">{hint ?? `${kinds}. Up to ${maxFiles} file${maxFiles === 1 ? "" : "s"}, ${maxSizeMB} MB each.`}</span>
        <input className="sr-only" type="file" multiple={maxFiles > 1} accept={accept.join(",")} disabled={disabled} onChange={(e) => { take(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      </label>
      {problem && <p role="alert" className="mt-1 text-xs text-red-600">{problem}</p>}
      {(existing?.length || files.length) ? <ul className="mt-2 space-y-1">
        {existing?.map((name) => <li key={name} className="flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 text-xs"><FileText size={13} aria-hidden /><span className="min-w-0 flex-1 truncate">{name}</span><span className="text-muted">saved</span></li>)}
        {files.map((file, index) => <li key={file.name + file.size} className="flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 text-xs"><FileText size={13} aria-hidden /><span className="min-w-0 flex-1 truncate">{file.name}</span><span className="text-muted">{(file.size / 1024).toFixed(0)} KB</span>
          <button type="button" aria-label={`Remove ${file.name}`} disabled={disabled} onClick={() => onChange(files.filter((_, i) => i !== index))} className="rounded p-1 text-muted hover:bg-card hover:text-red-600"><X size={13} /></button></li>)}
      </ul> : null}
    </div>
  );
}
