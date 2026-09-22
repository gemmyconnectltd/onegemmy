"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Upload, Download, CheckCircle2, XCircle, FileText } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { FormFooter } from "@/components/ui/Form";

// Generic bulk-import drawer shared by every "Import" flow (products,
// customers, suppliers, expenses, orders): download an Excel template,
// drop/browse a .xlsx/.xls/.csv file, preview parsed rows with per-row
// validity, submit only the valid ones. Entity-specific parsing/columns are
// passed in; the drawer shell, drag-drop, and preview table are shared so
// each importer isn't a ~250-line copy. Excel is the primary path (most
// shop owners work in Excel, not raw CSV) — CSV stays supported for anyone
// exporting from another system.

export interface CsvPreviewColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  /** Shown with a required marker in the "fields you'll need" list before a
   *  file is uploaded, so rows missing it are predictable, not a surprise. */
  required?: boolean;
}

interface ParsedRow<T> {
  raw: Record<string, string>;
  data: T;
  valid: boolean;
  errors: string[];
}

export interface CsvImportDrawerProps<T> {
  open: boolean;
  onClose: () => void;
  onSubmit: (items: T[]) => Promise<void> | void;
  title: string;
  /** Singular noun for the submit label, e.g. "customer" -> "Import 3 customers". */
  itemNoun: string;
  templateFilename: string;
  templateHeaders: string[];
  templateSampleRows: string[][];
  previewColumns: CsvPreviewColumn[];
  /** Validates + maps one raw CSV row; return errors to mark the row invalid. */
  parseRow: (raw: Record<string, string>) => { data: T; errors: string[] };
  color?: string;
}

const FILE_EXT_RE = /\.(xlsx|xls|csv)$/i;

function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, "");
}

function parseCsvText(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(normalizeHeader);
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

/** Reads the first sheet of an .xlsx/.xls workbook into the same
 * lowercased-header row shape the CSV parser produces, so downstream
 * validation/preview code never needs to know which format was uploaded. */
function parseWorkbook(buffer: ArrayBuffer): Record<string, string>[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: false, defval: "" });
  if (grid.length < 2) return [];
  const headers = grid[0].map((h) => normalizeHeader(String(h ?? "")));
  return grid.slice(1)
    .map((line) => {
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = String(line[i] ?? "").trim(); });
      return row;
    })
    .filter((row) => Object.values(row).some((v) => v !== ""));
}

export function CsvImportDrawer<T>({
  open, onClose, onSubmit, title, itemNoun, templateFilename, templateHeaders, templateSampleRows, previewColumns, parseRow, color,
}: CsvImportDrawerProps<T>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow<T>[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const validRows = rows?.filter((r) => r.valid) ?? [];

  const handleFile = (file: File) => {
    setFileName(file.name);
    const isCsv = /\.csv$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const raws = isCsv
        ? parseCsvText(e.target?.result as string)
        : parseWorkbook(e.target?.result as ArrayBuffer);
      setRows(raws.map((raw) => {
        const { data, errors } = parseRow(raw);
        return { raw, data, valid: errors.length === 0, errors };
      }));
    };
    if (isCsv) reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && FILE_EXT_RE.test(file.name)) handleFile(file);
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([templateHeaders, ...templateSampleRows]);
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, templateFilename);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validRows.length || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(validRows.map((r) => r.data));
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={title}
      description={rows ? `${validRows.length} valid · ${rows.length - validRows.length} errors` : "Upload an Excel or CSV file"}
      size="lg"
      footer={
        rows && (
          <form onSubmit={submit}>
            <FormFooter
              submitLabel={submitting ? "Importing…" : `Import ${validRows.length} ${itemNoun}${validRows.length !== 1 ? "s" : ""}`}
              onCancel={onClose}
              disabled={validRows.length === 0 || submitting}
              color={color}
            />
          </form>
        )
      }
    >
      <div className="p-5 space-y-4">
        {!rows && (
          <div className="border border-border rounded-lg p-4">
            <p className="text-sm font-semibold text-foreground mb-1">Fields you&apos;ll need</p>
            <p className="text-xs text-muted mb-3">Prepare a spreadsheet with these columns — <span className="font-semibold text-foreground">bold</span> ones are required, the rest are optional.</p>
            <div className="flex flex-wrap gap-1.5">
              {previewColumns.map((c) => (
                <span
                  key={c.key}
                  className={`text-[11px] px-2.5 py-1 rounded-full border ${
                    c.required
                      ? "border-transparent font-semibold text-white"
                      : "border-border text-muted"
                  }`}
                  style={c.required ? { backgroundColor: color ?? "var(--accent)" } : undefined}
                >
                  {c.label}
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={downloadTemplate}
          className="w-full flex items-center gap-3 px-4 py-3 border border-border rounded-lg hover:bg-surface transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color ? `${color}15` : "var(--accent-10)" }}>
            <Download size={15} style={{ color: color ?? "var(--accent)" }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Download Excel template</p>
            <p className="text-xs text-muted">Fill it in Excel, Google Sheets, or Numbers, then upload it back here</p>
          </div>
        </button>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            dragging ? "border-accent bg-accent/5" : "border-border hover:border-foreground/30 hover:bg-surface/50"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <Upload size={24} className="mx-auto mb-2 text-muted" />
          {fileName ? (
            <p className="text-sm font-semibold text-foreground">{fileName}</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-foreground">Drop your Excel or CSV file here, or click to browse</p>
              <p className="text-xs text-muted mt-1">.xlsx, .xls or .csv files</p>
            </>
          )}
        </div>

        {rows && rows.length > 0 && (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-surface/50 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Preview — {rows.length} rows</span>
              <button type="button" onClick={() => { setRows(null); setFileName(""); }} className="text-xs text-muted hover:text-foreground">Clear</button>
            </div>
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface/30 text-left">
                    <th className="px-3 py-2 text-muted font-semibold w-6" />
                    {previewColumns.map((c) => (
                      <th key={c.key} className={`px-3 py-2 text-muted font-semibold ${c.align === "right" ? "text-right" : ""}`}>
                        {c.label}{c.required && <span className="text-red-400"> *</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row, i) => (
                    <tr key={i} className={row.valid ? "bg-white dark:bg-transparent" : "bg-red-50 dark:bg-red-950/30"}>
                      <td className="px-3 py-2">
                        {row.valid
                          ? <CheckCircle2 size={13} className="text-emerald-500" />
                          : <XCircle size={13} className="text-red-500" />}
                      </td>
                      {previewColumns.map((c, ci) => (
                        <td key={c.key} className={`px-3 py-2 ${c.align === "right" ? "text-right" : ""} ${ci === 0 ? "font-medium text-foreground" : "text-muted"}`}>
                          {row.raw[c.key] || <span className="text-red-400">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.some((r) => !r.valid) && (
              <div className="px-4 py-2.5 bg-red-50 dark:bg-red-950/30 border-t border-red-100 dark:border-red-900">
                <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                  {rows.filter((r) => !r.valid).length} row(s) have errors and will be skipped on import.
                </p>
              </div>
            )}
          </div>
        )}

        {rows && rows.length === 0 && (
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
            <FileText size={14} className="text-amber-500" />
            <p className="text-xs text-amber-700 font-medium">No rows found. Make sure the file has a header row and data rows.</p>
          </div>
        )}
      </div>
    </Drawer>
  );
}
