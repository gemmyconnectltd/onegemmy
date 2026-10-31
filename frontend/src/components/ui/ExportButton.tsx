"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { downloadTable, type ExportTable } from "@/lib/exportTable";

/** The Export button every Import page shows beside Import. It exports what the page is currently filtered to, as an Excel file. */
export function ExportButton({ build, label = "Export", disabled }: { build: () => Promise<ExportTable>; label?: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const table = await build();
      if (table.rows.length === 0) setProblem("There is nothing to export for the current filters.");
      else downloadTable(table);
    } catch (e: unknown) {
      setProblem((e as { detail?: string })?.detail ?? (e as Error)?.message ?? "The export could not be created. Try again.");
    } finally { setBusy(false); }
  };
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button variant="secondary" onClick={() => void run()} disabled={busy || disabled}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} {label}</Button>
      {problem && <span role="alert" className="max-w-[240px] text-right text-[11px] font-medium text-red-600">{problem}</span>}
    </span>
  );
}
