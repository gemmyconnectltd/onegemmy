"use client";
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { adminApi } from "@/lib/api/admin";
import type { AdminUserExportFormat, AdminUserExportScope, AdminUserFilters } from "@/lib/api/admin";

const COLUMN_OPTIONS: { key: string; label: string }[] = [
  { key: "full_name", label: "Full Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "tenant_name", label: "Business" },
  { key: "role", label: "Role" },
  { key: "branch_name", label: "Branch" },
  { key: "status", label: "Status" },
  { key: "created_at", label: "Created At" },
  { key: "updated_at", label: "Updated At" },
];
const DEFAULT_COLUMNS = ["full_name", "email", "tenant_name", "role", "status", "created_at"];

interface ExportUsersModalProps {
  open: boolean;
  onClose: () => void;
  /** Current dashboard filters — sent as-is for "Filtered Results"/"Current Page". */
  filters: AdminUserFilters;
  filtersLabel: { label: string; value: string }[];
  filteredTotal: number;
  allTotal: number;
  currentPageCount: number;
  page: number;
  pageSize: number;
  selectedIds: string[];
  onExported: (count: number) => void;
  onError: (message: string) => void;
}

export function ExportUsersModal({
  open, onClose, filters, filtersLabel, filteredTotal, allTotal, currentPageCount,
  page, pageSize, selectedIds, onExported, onError,
}: ExportUsersModalProps) {
  const [scope, setScope] = useState<AdminUserExportScope>("filtered");
  const [format, setFormat] = useState<AdminUserExportFormat>("xlsx");
  const [columns, setColumns] = useState<string[]>(DEFAULT_COLUMNS);
  const [exporting, setExporting] = useState(false);

  const toggleColumn = (key: string) =>
    setColumns((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));

  const scopeOptions: { key: AdminUserExportScope; label: string; count: number }[] = [
    { key: "filtered", label: "Filtered Results", count: filteredTotal },
    { key: "all", label: "All Users", count: allTotal },
    { key: "current_page", label: "Current Page", count: currentPageCount },
    ...(selectedIds.length > 0 ? [{ key: "selected" as const, label: "Selected Users", count: selectedIds.length }] : []),
  ];
  const scopeCount = scopeOptions.find((o) => o.key === scope)?.count ?? 0;

  const handleExport = async () => {
    if (scopeCount === 0 || exporting) return;
    setExporting(true);
    try {
      await adminApi.exportUsers({
        scope, format, columns,
        ...(scope === "filtered" ? filters : {}),
        ...(scope === "current_page" ? { ...filters, page, page_size: pageSize } : {}),
        ...(scope === "selected" ? { selected_ids: selectedIds } : {}),
      });
      onExported(scopeCount);
      onClose();
    } catch (e) {
      onError((e as { detail?: string })?.detail ?? "Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      side="center"
      size="md"
      title="Export Users"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-[13px] font-semibold border border-border rounded-lg text-foreground/60 hover:text-foreground hover:bg-surface transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || scopeCount === 0 || columns.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-bold text-white rounded-lg bg-accent hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {exporting ? "Preparing export..." : `Export ${scopeCount} User${scopeCount === 1 ? "" : "s"}`}
          </button>
        </div>
      }
    >
      <div className="p-5 space-y-5">
        {/* Scope */}
        <div>
          <p className="text-[12px] font-semibold text-muted mb-2">Export</p>
          <div className="space-y-1.5">
            {scopeOptions.map((opt) => (
              <label
                key={opt.key}
                className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${scope === opt.key ? "border-accent bg-accent/5" : "border-border hover:bg-surface"}`}
              >
                <span className="flex items-center gap-2">
                  <input type="radio" name="export-scope" checked={scope === opt.key} onChange={() => setScope(opt.key)} className="w-4 h-4" />
                  <span className="text-[13px] font-medium text-foreground">{opt.label}</span>
                </span>
                <span className="text-[12px] text-muted">{opt.count} user{opt.count === 1 ? "" : "s"}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Format */}
        <div>
          <p className="text-[12px] font-semibold text-muted mb-2">Format</p>
          <div className="flex gap-2">
            {([{ key: "xlsx", label: "Excel" }, { key: "csv", label: "CSV" }] as const).map((f) => (
              <label
                key={f.key}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${format === f.key ? "border-accent bg-accent/5" : "border-border hover:bg-surface"}`}
              >
                <input type="radio" name="export-format" checked={format === f.key} onChange={() => setFormat(f.key)} className="w-4 h-4" />
                <span className="text-[13px] font-medium text-foreground">{f.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Columns */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-semibold text-muted">Columns</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setColumns(COLUMN_OPTIONS.map((c) => c.key))} className="text-[11px] font-semibold text-accent hover:underline">
                Select All
              </button>
              <button type="button" onClick={() => setColumns([])} className="text-[11px] font-semibold text-muted hover:underline">
                Clear All
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {COLUMN_OPTIONS.map((c) => (
              <label key={c.key} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-surface cursor-pointer">
                <input type="checkbox" checked={columns.includes(c.key)} onChange={() => toggleColumn(c.key)} className="w-4 h-4 rounded" />
                <span className="text-[13px] text-foreground">{c.label}</span>
              </label>
            ))}
          </div>
          {columns.length === 0 && <p className="text-[11px] text-red-500 mt-1.5">Select at least one column</p>}
        </div>

        {/* Current filters */}
        {filtersLabel.length > 0 && (scope === "filtered" || scope === "current_page") && (
          <div className="bg-surface/60 border border-border rounded-xl px-3.5 py-3">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5">Current Filters</p>
            <div className="space-y-0.5">
              {filtersLabel.map((f) => (
                <p key={f.label} className="text-[12px] text-foreground"><span className="text-muted">{f.label}:</span> {f.value}</p>
              ))}
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
