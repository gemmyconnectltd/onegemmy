"use client";
import { Trash2, X } from "lucide-react";

interface Props {
  count: number;
  label: string;
  /** Plural form, for irregular nouns (e.g. "category" -> "categories"). Defaults to `label + "s"`. */
  pluralLabel?: string;
  onDelete: () => void;
  onClear: () => void;
  deleting?: boolean;
}

/** Sticky-feeling action bar that appears once at least one row is checked.
 *  Shared across list pages so bulk-delete looks and behaves the same everywhere. */
export function BulkActionBar({ count, label, pluralLabel, onDelete, onClear, deleting }: Props) {
  if (count === 0) return null;
  const noun = count === 1 ? label : (pluralLabel ?? `${label}s`);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-accent/5 border border-accent/20">
      <p className="text-sm font-semibold text-foreground">{count} {noun} selected</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface transition-colors text-[12px] font-semibold"
        >
          <X size={13} /> Clear
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors text-[12px] font-semibold disabled:opacity-50"
        >
          <Trash2 size={13} /> {deleting ? "Deleting…" : "Delete Selected"}
        </button>
      </div>
    </div>
  );
}
