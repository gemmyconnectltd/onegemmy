"use client";

import { useState } from "react";
import { Button } from "./Button";
import { Drawer } from "./Drawer";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  confirmText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** In-app replacement for window.confirm() — matches the app's design instead
 *  of the browser's native, unstyleable dialog. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  confirmText,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  return (
    <Drawer
      open={open}
      onClose={onCancel}
      side="center"
      size="sm"
      title={title}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
          <Button type="button" variant={danger ? "destructive" : "primary"} onClick={onConfirm} disabled={!!confirmText && typed !== confirmText}>{confirmLabel}</Button>
        </div>
      }
    >
      <div className="px-5 py-4 space-y-3"><p className="text-sm text-muted leading-relaxed">{message}</p>{confirmText && <label className="block text-sm">Type <strong>{confirmText}</strong> to confirm<input className="mt-2 w-full rounded-lg border border-border bg-surface p-2" aria-label={`Type ${confirmText} to confirm`} value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" /></label>}</div>
    </Drawer>
  );
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  confirmText?: string;
  onConfirm: () => void;
}

/** State + dialog element for a page that needs one confirm-before-action
 *  prompt at a time. Usage: `const { confirm, dialog } = useConfirmDialog();`
 *  then `confirm({ title, message, onConfirm })` in place of `window.confirm`,
 *  and render `{dialog}` once anywhere in the page. */
export function useConfirmDialog() {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);

  const confirm = (options: ConfirmOptions) => setPending(options);

  const dialog = pending ? (
    <ConfirmDialog
      open
      title={pending.title}
      message={pending.message}
      confirmLabel={pending.confirmLabel}
      danger={pending.danger}
      confirmText={pending.confirmText}
      onConfirm={() => {
        const { onConfirm } = pending;
        setPending(null);
        onConfirm();
      }}
      onCancel={() => setPending(null)}
    />
  ) : null;

  return { confirm, dialog };
}
