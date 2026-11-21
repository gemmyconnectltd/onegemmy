"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2, Sheet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { reportsApi, type ExportFormat, type ReportTab, type SalesDimension } from "@/lib/api/reports";
import { useFeatureActions } from "@/lib/useFeatureActions";

const FORMATS: { format: ExportFormat; label: string; hint: string; icon: typeof FileText }[] = [
  { format: "pdf", label: "PDF", hint: "Branded document to print or send", icon: FileText },
  { format: "xlsx", label: "Excel", hint: "Real numbers, ready to work with", icon: FileSpreadsheet },
  { format: "csv", label: "CSV", hint: "Plain data for other systems", icon: Sheet },
];

/**
 * Export for every Business reports tab: the same figures as the screen, as a document carrying the business's own
 * logo, contacts, TIN/VAT number and brand colour (PDF), or as Excel / CSV. Uses the current period and branch.
 */
export function ReportExport({ tab, scope, dimension, onExport }: { tab?: ReportTab; scope?: { from?: string; to?: string; branch?: string }; dimension?: SalesDimension;
  /** For a report with its own export endpoint (the Daily report); otherwise the tab export is used. */
  onExport?: (format: ExportFormat) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const controls = useFeatureActions();
  const off = controls.blocked.has("export");

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  const run = async (format: ExportFormat) => {
    setOpen(false);
    setBusy(format);
    setProblem(null);
    try { await (onExport ? onExport(format) : reportsApi.exportTab(tab!, scope ?? {}, format, dimension)); }
    catch (e: unknown) { setProblem((e as { detail?: string })?.detail ?? (e as Error)?.message ?? "The export could not be created. Try again."); }
    finally { setBusy(null); }
  };

  return (
    <div ref={root} className="relative inline-flex flex-col items-end gap-1">
      <Button variant="secondary" aria-haspopup="menu" aria-expanded={open} disabled={!!busy || off} title={off ? controls.reason ?? undefined : undefined} onClick={() => setOpen(!open)}>
        {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Download size={15} aria-hidden />}
        {busy ? `Preparing ${FORMATS.find((f) => f.format === busy)?.label}…` : "Export"}
        <ChevronDown size={14} aria-hidden />
      </Button>
      {open && (
        <div role="menu" aria-label="Export format" className="absolute right-0 top-full z-40 mt-1.5 w-64 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lg">
          {FORMATS.map(({ format, label, hint, icon: Icon }) => (
            <button key={format} role="menuitem" type="button" onClick={() => void run(format)}
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent">
              <Icon size={17} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              <span><span className="block text-sm font-semibold text-foreground">{label}</span><span className="block text-[12px] text-muted">{hint}</span></span>
            </button>
          ))}
        </div>
      )}
      {problem && <p role="alert" className="max-w-[260px] text-right text-[12px] text-red-600">{problem}</p>}
    </div>
  );
}
