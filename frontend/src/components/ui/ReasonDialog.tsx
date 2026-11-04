"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Textarea } from "@/components/ui/Form";

/** Asks for a written reason before a consequential action; the reason goes to the audit trail. */
export function ReasonDialog({ open, title, message, confirmLabel, danger = false, minLength = 3, onConfirm, onClose }: {
  open: boolean; title: string; message: string; confirmLabel: string; danger?: boolean; minLength?: number;
  onConfirm: (reason: string) => Promise<void>; onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const close = () => { if (!busy) { setReason(""); setError(""); onClose(); } };
  const confirm = async () => {
    setBusy(true); setError("");
    try { await onConfirm(reason.trim()); setReason(""); onClose(); }
    catch (cause) { setError((cause as { detail?: string })?.detail ?? "That didn't work. Please try again."); }
    finally { setBusy(false); }
  };
  return <Drawer open={open} onClose={close} side="center" size="sm" title={title}>
    <div className="space-y-3 p-4">
      <p className="text-sm text-muted">{message}</p>
      <label className="block text-xs font-medium">Reason (required)<Textarea autoFocus rows={3} maxLength={500} aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" disabled={busy} onClick={close}>Cancel</Button>
        <Button variant={danger ? "destructive" : "default"} disabled={busy || reason.trim().length < minLength} onClick={() => void confirm()}>{busy ? "Working…" : confirmLabel}</Button>
      </div>
    </div>
  </Drawer>;
}
