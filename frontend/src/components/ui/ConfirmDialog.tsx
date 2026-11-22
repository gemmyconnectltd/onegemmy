"use client";

import { useRef, useState } from "react";
import { Button } from "./Button";
import { Drawer } from "./Drawer";
import { apiErrorMessage } from "@/lib/api/errors";

/** A confirmed action. Return its promise (e.g. `mutation.mutateAsync(id)`) and the dialog stays open, shows progress,
 *  refuses a second click, and shows the error in place if it fails; it closes once the action has succeeded. */
type ConfirmAction = () => void | Promise<unknown>;

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  busyLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: ConfirmAction;
  onCancel: () => void;
}

/** In-app replacement for window.confirm() — matches the app's design instead
 *  of the browser's native, unstyleable dialog. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  busyLabel = "Working…",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const running = useRef(false);  // a synchronous guard: a double click lands before React re-renders the disabled button

  const close = () => { if (!running.current) { setFailure(null); onCancel(); } };
  const confirm = async () => {
    if (running.current) return;
    const result = onConfirm();
    if (!(result instanceof Promise)) return;  // fire-and-forget callers close the dialog themselves, as before
    running.current = true; setBusy(true); setFailure(null);
    try {
      await result;
      running.current = false; setBusy(false);
      onCancel();
    } catch (error) {
      running.current = false; setBusy(false);
      setFailure(apiErrorMessage(error, "The action could not be completed."));
    }
  };

  return (
    <Drawer
      open={open}
      onClose={close}
      side="center"
      size="sm"
      title={title}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={close}>{cancelLabel}</Button>
          <Button type="button" variant={danger ? "destructive" : "primary"} loading={busy} loadingLabel={busyLabel} onClick={() => void confirm()}>
            {failure ? "Try again" : confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="px-5 py-4 text-sm text-muted leading-relaxed">{message}</p>
      {failure && <p role="alert" className="mx-5 mb-4 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:text-red-400">{failure}</p>}
    </Drawer>
  );
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  busyLabel?: string;
  danger?: boolean;
  onConfirm: ConfirmAction;
}

/** State + dialog element for a page that needs one confirm-before-action
 *  prompt at a time. Usage: `const { confirm, dialog } = useConfirmDialog();`
 *  then `confirm({ title, message, onConfirm })` in place of `window.confirm`,
 *  and render `{dialog}` once anywhere in the page. Return the action's promise from `onConfirm` for in-dialog progress. */
export function useConfirmDialog() {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const confirm = (options: ConfirmOptions) => setPending(options);
  const dialog = pending ? (
    <ConfirmDialog
      open
      title={pending.title}
      message={pending.message}
      confirmLabel={pending.confirmLabel}
      busyLabel={pending.busyLabel}
      danger={pending.danger}
      onConfirm={() => {
        const result = pending.onConfirm();
        if (!(result instanceof Promise)) setPending(null);  // legacy: close at once and let the action run
        return result;
      }}
      onCancel={() => setPending(null)}
    />
  ) : null;

  return { confirm, dialog };
}
