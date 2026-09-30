"use client";
import { useEffect, useState } from "react";
import { X, Search, Sparkles, CheckCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useServiceTemplates, useImportServices } from "@/lib/api/hooks";
import type { ApiServiceTemplate } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  color: string;
}

export default function ImportServiceTemplatesModal({ open, onClose, color }: Props) {
  const [search, setSearch] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  // Keyed per template so browsing between templates doesn't lose earlier picks.
  const [selections, setSelections] = useState<Record<string, Set<string>>>({});

  const { data, isLoading } = useServiceTemplates({ enabled: open });
  const importServices = useImportServices();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const templates = data?.templates ?? [];
  const existingLower = new Set((data?.existing ?? []).map((n) => n.toLowerCase()));

  const filtered = templates.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

  const activeId = selectedTemplateId ?? templates[0]?.id ?? null;
  const active: ApiServiceTemplate | undefined = templates.find((t) => t.id === activeId);

  function close() {
    setSelections({});
    setSelectedTemplateId(null);
    setSearch("");
    onClose();
  }

  function toggleItem(templateId: string, itemName: string) {
    setSelections((prev) => {
      const next = { ...prev };
      const set = new Set(next[templateId]);
      if (set.has(itemName)) set.delete(itemName); else set.add(itemName);
      next[templateId] = set;
      return next;
    });
  }

  function toggleGroup(templateId: string, itemNames: string[]) {
    setSelections((prev) => {
      const next = { ...prev };
      const set = new Set(next[templateId]);
      const allSelected = itemNames.every((i) => set.has(i));
      itemNames.forEach((i) => (allSelected ? set.delete(i) : set.add(i)));
      next[templateId] = set;
      return next;
    });
  }

  function selectAll(templateId: string, allItemNames: string[]) {
    setSelections((prev) => ({ ...prev, [templateId]: new Set(allItemNames) }));
  }

  const selectedItems = templates.flatMap((t) => {
    const set = selections[t.id];
    if (!set || set.size === 0) return [];
    return t.groups.flatMap((g) => g.items.filter((i) => set.has(i.name)).map((i) => ({ ...i, category_name: g.name })));
  });
  const groupsWithSelections = templates.reduce((count, t) => {
    const set = selections[t.id];
    if (!set || set.size === 0) return count;
    return count + t.groups.filter((g) => g.items.some((i) => set.has(i.name))).length;
  }, 0);

  async function handleImport() {
    if (selectedItems.length === 0 || importServices.isPending) return;
    try {
      await importServices.mutateAsync(selectedItems);
      close();
    } catch { /* ignore */ }
  }

  const activeSelected = active ? (selections[active.id] ?? new Set<string>()) : new Set<string>();
  const activeAllItemNames = active
    ? active.groups.flatMap((g) => g.items).filter((i) => !existingLower.has(i.name.toLowerCase())).map((i) => i.name)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 animate-drawer-fade" onClick={close} aria-hidden="true" />
      <div role="dialog" aria-modal="true" className="relative bg-card border border-border shadow-2xl w-full max-w-6xl h-[85vh] rounded-2xl flex flex-col overflow-hidden animate-drawer-center">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-lg font-bold text-foreground">Import Service Templates</h2>
          <button onClick={close} aria-label="Close" className="text-muted hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-3 px-6 py-3 border-b border-border flex-shrink-0 flex-wrap">
          <div className="relative w-64">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-border rounded-lg text-[13px] focus:border-foreground/30 outline-none bg-surface"
            />
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="w-72 flex-shrink-0 border-r border-border overflow-y-auto">
            {isLoading ? (
              <p className="text-sm text-muted p-5">Loading templates…</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted p-5">No templates match your search.</p>
            ) : (
              <div className="p-3 space-y-2">
                {filtered.map((t) => {
                  const count = t.groups.reduce((n, g) => n + g.items.length, 0);
                  const isActive = t.id === activeId;
                  const picked = selections[t.id]?.size ?? 0;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTemplateId(t.id)}
                      className={`w-full text-left px-3.5 py-3 rounded-xl border transition-colors ${
                        isActive ? "bg-accent/5" : "border-border hover:border-foreground/20"
                      }`}
                      style={isActive ? { borderColor: color } : undefined}
                    >
                      <p className="text-[13px] font-bold text-foreground">{t.name}</p>
                      <p className="text-[11px] text-muted mt-1 flex items-center gap-1.5">
                        <Sparkles size={11} /> {count} Services
                        {picked > 0 && <span className="font-semibold" style={{ color }}>· {picked} selected</span>}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {!active ? (
              <div className="text-center py-16">
                <Sparkles size={28} className="text-border mx-auto mb-2" />
                <p className="text-sm font-semibold text-muted">No template selected.</p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md bg-surface text-muted">{active.industry}</span>
                    <h3 className="text-lg font-bold text-foreground mt-2">{active.name}</h3>
                  </div>
                  <Button size="sm" onClick={() => selectAll(active.id, activeAllItemNames)} className="rounded-lg flex-shrink-0">
                    <CheckCheck size={14} /> Select All Services
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {active.groups.map((g) => {
                    const importableNames = g.items.filter((i) => !existingLower.has(i.name.toLowerCase())).map((i) => i.name);
                    const groupAllSelected = importableNames.length > 0 && importableNames.every((n) => activeSelected.has(n));
                    return (
                      <div key={g.name} className="border border-border rounded-xl p-4">
                        <label className="flex items-center gap-2 mb-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={groupAllSelected}
                            disabled={importableNames.length === 0}
                            onChange={() => toggleGroup(active.id, importableNames)}
                            className="w-4 h-4 rounded disabled:opacity-40"
                            style={{ accentColor: color }}
                          />
                          <Sparkles size={14} className="text-muted" />
                          <span className="text-[13px] font-bold text-foreground uppercase tracking-wide">{g.name}</span>
                        </label>
                        <div className="space-y-1.5">
                          {g.items.map((item) => {
                            const isSelected = activeSelected.has(item.name);
                            const alreadyExists = existingLower.has(item.name.toLowerCase());
                            return (
                              <button
                                key={item.name}
                                type="button"
                                disabled={alreadyExists}
                                onClick={() => toggleItem(active.id, item.name)}
                                title={alreadyExists ? "Already in your catalog" : undefined}
                                className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                  isSelected ? "text-white" : "bg-surface text-muted hover:text-foreground"
                                }`}
                                style={isSelected ? { backgroundColor: color } : undefined}
                              >
                                <span>{item.name}</span>
                                <span className={`inline-flex items-center gap-1 text-[10px] font-normal ${isSelected ? "text-white/80" : "text-muted/70"}`}>
                                  <Clock size={10} /> {item.duration_minutes}m
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-surface flex items-center justify-center">
              <Sparkles size={15} className="text-muted" />
            </div>
            <div>
              <p className="text-[13px] font-bold text-foreground">{selectedItems.length} Services Selected</p>
              <p className="text-[11px] text-muted">Across {groupsWithSelections} categor{groupsWithSelections === 1 ? "y" : "ies"}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={close} className="rounded-lg">Cancel</Button>
            <Button onClick={handleImport} disabled={selectedItems.length === 0 || importServices.isPending} className="rounded-lg">
              {importServices.isPending ? "Importing…" : "Import Services"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
