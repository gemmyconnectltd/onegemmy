"use client";
import { useEffect, useState } from "react";
import { X, Search, Building2, CheckCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useDepartmentTemplates, useImportDepartments } from "@/lib/api/hooks";
import type { ApiDepartmentTemplate } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  color: string;
}

export default function ImportTemplatesModal({ open, onClose, color }: Props) {
  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState("All Industries");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  // Keyed per template so browsing between templates doesn't lose earlier picks.
  const [selections, setSelections] = useState<Record<string, Set<string>>>({});

  const { data, isLoading } = useDepartmentTemplates({ enabled: open });
  const importDepartments = useImportDepartments();

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
  const industries = ["All Industries", ...Array.from(new Set(templates.map((t) => t.industry))).sort()];

  const filtered = templates.filter((t) =>
    (industryFilter === "All Industries" || t.industry === industryFilter) &&
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const defaultTemplateId = templates.find((t) => t.industry === data?.tenant_industry)?.id ?? templates[0]?.id ?? null;
  const activeId = selectedTemplateId ?? defaultTemplateId;
  const active: ApiDepartmentTemplate | undefined = templates.find((t) => t.id === activeId);

  function close() {
    setSelections({});
    setSelectedTemplateId(null);
    setSearch("");
    setIndustryFilter("All Industries");
    onClose();
  }

  function toggleItem(templateId: string, item: string) {
    setSelections((prev) => {
      const next = { ...prev };
      const set = new Set(next[templateId]);
      if (set.has(item)) set.delete(item); else set.add(item);
      next[templateId] = set;
      return next;
    });
  }

  function toggleGroup(templateId: string, items: string[]) {
    setSelections((prev) => {
      const next = { ...prev };
      const set = new Set(next[templateId]);
      const allSelected = items.every((i) => set.has(i));
      items.forEach((i) => (allSelected ? set.delete(i) : set.add(i)));
      next[templateId] = set;
      return next;
    });
  }

  function selectAll(templateId: string, allItems: string[]) {
    setSelections((prev) => ({ ...prev, [templateId]: new Set(allItems) }));
  }

  const allSelectedNames = Array.from(new Set(Object.values(selections).flatMap((s) => Array.from(s))));
  const groupsWithSelections = templates.reduce((count, t) => {
    const set = selections[t.id];
    if (!set || set.size === 0) return count;
    return count + t.groups.filter((g) => g.items.some((i) => set.has(i))).length;
  }, 0);

  async function handleImport() {
    if (allSelectedNames.length === 0 || importDepartments.isPending) return;
    try {
      await importDepartments.mutateAsync(allSelectedNames);
      close();
    } catch { /* ignore */ }
  }

  const activeSelected = active ? (selections[active.id] ?? new Set<string>()) : new Set<string>();
  const activeAllItems = active
    ? active.groups.flatMap((g) => g.items).filter((i) => !existingLower.has(i.toLowerCase()))
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 animate-drawer-fade" onClick={close} aria-hidden="true" />
      <div role="dialog" aria-modal="true" className="relative bg-card border border-border shadow-2xl w-full max-w-6xl h-[85vh] rounded-2xl flex flex-col overflow-hidden animate-drawer-center">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-lg font-bold text-foreground">Import Department Templates</h2>
          <button onClick={close} aria-label="Close" className="text-muted hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-3 px-6 py-3 border-b border-border flex-shrink-0 flex-wrap">
          <div className="relative w-64">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search templates or industries..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-border rounded-lg text-[13px] focus:border-foreground/30 outline-none bg-surface"
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {industries.map((ind) => (
              <button
                key={ind}
                onClick={() => setIndustryFilter(ind)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold whitespace-nowrap border transition-colors ${
                  industryFilter === ind ? "text-white border-transparent" : "border-border text-muted hover:text-foreground"
                }`}
                style={industryFilter === ind ? { backgroundColor: color } : undefined}
              >
                {ind}
              </button>
            ))}
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
                        <Building2 size={11} /> {count} Departments
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
                  <Button size="sm" onClick={() => selectAll(active.id, activeAllItems)} className="rounded-lg flex-shrink-0">
                    <CheckCheck size={14} /> Select All Items
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {active.groups.map((g) => {
                    const importableItems = g.items.filter((i) => !existingLower.has(i.toLowerCase()));
                    const groupAllSelected = importableItems.length > 0 && importableItems.every((i) => activeSelected.has(i));
                    return (
                      <div key={g.name} className="border border-border rounded-xl p-4">
                        <label className="flex items-center gap-2 mb-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={groupAllSelected}
                            disabled={importableItems.length === 0}
                            onChange={() => toggleGroup(active.id, importableItems)}
                            className="w-4 h-4 rounded disabled:opacity-40"
                            style={{ accentColor: color }}
                          />
                          <Building2 size={14} className="text-muted" />
                          <span className="text-[13px] font-bold text-foreground uppercase tracking-wide">{g.name}</span>
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {g.items.map((item) => {
                            const isSelected = activeSelected.has(item);
                            const alreadyExists = existingLower.has(item.toLowerCase());
                            return (
                              <button
                                key={item}
                                type="button"
                                disabled={alreadyExists}
                                onClick={() => toggleItem(active.id, item)}
                                title={alreadyExists ? "Already in your departments" : undefined}
                                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                  isSelected ? "text-white" : "bg-surface text-muted hover:text-foreground"
                                }`}
                                style={isSelected ? { backgroundColor: color } : undefined}
                              >
                                {item}
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
              <Building2 size={15} className="text-muted" />
            </div>
            <div>
              <p className="text-[13px] font-bold text-foreground">{allSelectedNames.length} Items Selected</p>
              <p className="text-[11px] text-muted">Across {groupsWithSelections} department group{groupsWithSelections === 1 ? "" : "s"}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={close} className="rounded-lg">Cancel</Button>
            <Button onClick={handleImport} disabled={allSelectedNames.length === 0 || importDepartments.isPending} className="rounded-lg">
              {importDepartments.isPending ? "Importing…" : "Import Departments"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
