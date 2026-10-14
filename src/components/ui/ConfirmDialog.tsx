"use client";

import { useState } from "react";
import { Drawer } from "./Drawer";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
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
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Drawer
      open={open}
      onClose={onCancel}
      side="center"
      size="sm"
      title={title}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-muted hover:text-foreground hover:bg-surface transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-accent hover:bg-accent/90"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <p className="px-5 py-4 text-sm text-muted leading-relaxed">{message}</p>
    </Drawer>
  );
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
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
