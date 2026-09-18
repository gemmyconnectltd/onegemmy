"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { useUnitSuggestions, useImportUnits } from "@/lib/api/hooks";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ImportUnitsModal({ open, onClose }: Props) {
  // Suggestions default to selected; this tracks which ones the user unchecked,
  // avoiding a setState-in-effect just to seed selection once data arrives.
  const [deselected, setDeselected] = useState<Set<string>>(new Set());

  const { data, isLoading } = useUnitSuggestions({ enabled: open });
  const importUnits = useImportUnits();
  const selected = (data?.suggested ?? []).filter((u) => !deselected.has(u.name));

  function close() {
    setDeselected(new Set());
    onClose();
  }

  function toggle(name: string) {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  async function handleImport() {
    if (selected.length === 0 || importUnits.isPending) return;
    try {
      await importUnits.mutateAsync(selected);
      close();
    } catch { /* ignore */ }
  }

  return (
    <Drawer
      open={open}
      onClose={close}
      side="center"
      size="md"
      title="Import Common Units"
      description="Pick the units of measure you want to add."
      footer={
        <div className="flex gap-2">
          <Button onClick={handleImport} disabled={selected.length === 0 || importUnits.isPending}>
            {importUnits.isPending ? "Importing…" : `Import ${selected.length || ""} Unit${selected.length === 1 ? "" : "s"}`.trim()}
          </Button>
          <Button type="button" variant="secondary" onClick={close}>Cancel</Button>
        </div>
      }
    >
      <div className="p-5">
        {isLoading ? (
          <p className="text-sm text-muted">Loading suggestions…</p>
        ) : !data || data.suggested.length === 0 ? (
          <div className="text-center py-8">
            <Sparkles size={28} className="text-border mx-auto mb-2" />
            <p className="text-sm font-semibold text-muted">
              {data?.existing.length ? "You already have all the common units." : "No suggestions available."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {data.suggested.map((u) => (
              <label key={u.name} className="flex items-center gap-2.5 px-3 py-2.5 border border-border rounded-lg cursor-pointer hover:border-foreground/20 transition-colors">
                <input
                  type="checkbox"
                  checked={selected.some((s) => s.name === u.name)}
                  onChange={() => toggle(u.name)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm font-medium text-foreground">{u.name}</span>
                {u.abbreviation && <span className="text-xs text-muted ml-auto">{u.abbreviation}</span>}
              </label>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}
