"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** The shared frame of every Data Management operation page: breadcrumb, business context, title and a step indicator. */
export function FlowShell({ title, subtitle, crumbs, business, steps, current, children, footer }: {
  title: string; subtitle?: string; crumbs: { label: string; href?: string }[]; business?: ReactNode; steps?: string[]; current?: number; children: ReactNode; footer?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-[12px] text-muted">
        <Link href="/data-management" aria-label="Back to Data Management" className="mr-1 flex h-7 w-7 items-center justify-center rounded-lg bg-surface hover:text-foreground"><ArrowLeft size={14} /></Link>
        {crumbs.map((c, i) => (
          <span key={c.label} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} aria-hidden />}
            {c.href ? <Link href={c.href} className="font-medium hover:text-foreground hover:underline">{c.label}</Link> : <span aria-current="page" className="font-semibold text-foreground">{c.label}</span>}
          </span>))}
      </nav>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h1 className="pesaa-page-title text-foreground">{title}</h1>{subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}</div>
        {business}
      </header>
      {steps && current !== undefined && (
        <ol aria-label="Steps" className="flex gap-1.5 overflow-x-auto pb-1">
          {steps.map((s, i) => (
            <li key={s} aria-current={i === current ? "step" : undefined} className={cn("flex flex-shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold", i === current ? "border-accent bg-accent/10 text-accent" : i < current ? "border-border text-foreground" : "border-border text-muted")}>
              <span className={cn("flex h-4 w-4 items-center justify-center rounded-full text-[10px]", i < current ? "bg-accent text-white" : "bg-surface")}>{i < current ? <Check size={10} /> : i + 1}</span>{s}
            </li>))}
        </ol>
      )}
      <div>{children}</div>
      {footer && <div className="sticky bottom-0 z-10 -mx-1 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">{footer}</div>}
    </div>
  );
}
