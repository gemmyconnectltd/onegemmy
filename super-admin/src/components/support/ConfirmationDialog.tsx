"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/** Support's name for the shared confirm dialog: every destructive Support action asks first. */
export function ConfirmationDialog(props: { open: boolean; title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return <ConfirmDialog {...props} danger={props.danger ?? true} />;
}
