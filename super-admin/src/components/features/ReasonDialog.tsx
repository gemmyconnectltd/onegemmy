"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Textarea } from "@/components/ui/Form";

/** Confirm a feature change that needs a reason for the audit log, and for the riskiest ones the key typed back. */
export function ReasonDialog({ title, message, confirmLabel, danger, requireKey, pending, error, onSubmit, onClose, extra }: {
  title: string; message: string; confirmLabel: string; danger?: boolean; requireKey?: string; pending?: boolean; error?: string | null; extra?: ReactNode;
  onSubmit: (reason: string) => void; onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const ready = reason.trim().length >= 3 && (!requireKey || typed === requireKey) && !pending;
  return (
    <Drawer open onClose={onClose} side="center" size="md" title={title}
      footer={<div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="button" variant={danger ? "destructive" : "primary"} disabled={!ready} onClick={() => onSubmit(reason.trim())}>
          {pending && <Loader2 size={13} className="animate-spin" />}{confirmLabel}
        </Button>
      </div>}>
      <div className="space-y-4 px-5 py-4">
        <p className="text-sm leading-relaxed text-muted">{message}</p>
        {extra}
        <Field label="Reason" required hint="Saved in the audit log with your name and the time.">
          <Textarea rows={2} maxLength={255} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Incident INC-142: duplicate postings" />
        </Field>
        {requireKey && <Field label={`Type ${requireKey} to confirm`}>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" aria-label={`Type ${requireKey} to confirm`} />
        </Field>}
        {error && <p role="alert" className="text-[13px] font-medium text-[var(--error)]">{error}</p>}
      </div>
    </Drawer>
  );
}
