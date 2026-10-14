import { useState } from "react";

/** Checkbox-based multi-select for a list of rows, keyed by id. Selection is
 *  cleared whenever the caller calls `clear()` (typically after a bulk action
 *  completes) — it does not track list identity, so callers should clear on
 *  unmount/filter changes if stale ids would otherwise linger. */
export function useBulkSelection(ids: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === ids.length && ids.length > 0 ? new Set() : new Set(ids)));
  }

  function clear() {
    setSelected(new Set());
  }

  const allSelected = ids.length > 0 && selected.size === ids.length;
  const someSelected = selected.size > 0 && !allSelected;

  return { selected, toggle, toggleAll, clear, allSelected, someSelected, count: selected.size };
}
