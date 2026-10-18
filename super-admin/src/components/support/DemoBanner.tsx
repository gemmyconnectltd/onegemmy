"use client";

import { useState } from "react";
import { FlaskConical, RotateCcw } from "lucide-react";
import { useSupport } from "@/lib/support/store";
import { ConfirmationDialog } from "./ConfirmationDialog";

/** Always visible: this module runs on sample data until the backend and channel integrations exist. */
export function DemoBanner() {
  const { actions } = useSupport();
  const [confirm, setConfirm] = useState(false);
  return (
    <div role="note" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[12px] sm:px-3.5 sm:py-2 sm:text-[12.5px] text-amber-800 dark:text-amber-300">
      <FlaskConical size={15} className="flex-shrink-0" />
      <p className="min-w-0 flex-1">
        <strong>Demo mode.</strong>{" "}
        <span className="sm:hidden">Sample data. Nothing is sent.</span>
        <span className="hidden sm:inline">Sample data only. Nothing is sent to customers, nothing is received, and changes stay in this browser.</span>
      </p>
      <button type="button" onClick={() => setConfirm(true)} className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold underline-offset-2 hover:underline">
        <RotateCcw size={12} /> <span className="hidden sm:inline">Reset demo data</span><span className="sm:hidden">Reset</span>
      </button>
      <ConfirmationDialog open={confirm} title="Reset demo data?" message="This restores the original sample conversations, templates and settings. Your demo changes in this browser will be lost." confirmLabel="Reset" onConfirm={() => { setConfirm(false); void actions.resetDemo(); }} onCancel={() => setConfirm(false)} />
    </div>
  );
}
