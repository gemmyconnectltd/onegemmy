"use client";
import { TableScroll } from "@/components/ui/TableScroll";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Upload, Download, CheckCircle2, XCircle, FileText, Loader2, AlertTriangle } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { FormFooter } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { parseCsv, summarizeIssues, type ImportIssue } from "@/lib/importValues";

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
  issues: ImportIssue[];
}

/** What an import ended with, shown in the drawer instead of closing it (e.g. products created and pictures attached). */
export interface ImportOutcome { summary: string; problems?: { label: string; reason: string }[] }

export interface CsvImportDrawerProps<T> {
  open: boolean;
  onClose: () => void;
  /** `file` is the spreadsheet that was chosen, for imports that also need something only the file holds (pictures pasted into its rows).
   *  `progress` updates the status line while it runs. Return an outcome to show a final summary instead of closing. */
  onSubmit: (items: T[], file?: File, progress?: (status: string) => void) => Promise<void | ImportOutcome> | void;
  title: string;
  /** Singular noun for the submit label, e.g. "customer" -> "Import 3 customers". */
  itemNoun: string;
  templateFilename: string;
  templateHeaders: string[];
  templateSampleRows: string[][];
  /** Template columns written as plain numbers (General format, no thousands separator) rather than text. */
  templateNumberColumns?: string[];
  /** Lines for a "How to use" sheet added after the template sheet. */
  templateHowTo?: string[];
  previewColumns: CsvPreviewColumn[];
  /** Validates + maps one raw row; return errors to mark the row invalid. An issue with a `column` highlights that cell. */
  parseRow: (raw: Record<string, string>) => { data: T; errors: (string | ImportIssue)[] };
  color?: string;
}

const FILE_EXT_RE = /\.(xlsx|xls|csv)$/i;

function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, "");
}

interface Sheet { headers: string[]; rows: Record<string, string>[] }

function toSheet(grid: string[][]): Sheet {
  if (grid.length < 2) return { headers: grid[0] ?? [], rows: [] };
  const headers = grid[0].map((h) => String(h ?? "").trim());
  const keys = headers.map(normalizeHeader);
  const rows = grid.slice(1)
    .map((line) => {
      const row: Record<string, string> = {};
      keys.forEach((k, i) => { if (k) row[k] = String(line[i] ?? "").trim(); });
      return row;
    })
    .filter((row) => Object.values(row).some((v) => v !== ""));
  return { headers, rows };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A cell's stored value rather than the text Excel displays, so "2,500" formatted with separators arrives as 2500,
 *  long barcodes aren't shown in scientific notation, and dates arrive as YYYY-MM-DD whatever the display format. */
function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.v === undefined || cell.v === null) return "";
  if (cell.t === "n") {
    if (cell.z && XLSX.SSF.is_date(cell.z)) {
      const d = XLSX.SSF.parse_date_code(cell.v as number);
      if (d) return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
    }
    return String(cell.v);
  }
  if (cell.t === "d" && cell.v instanceof Date) return `${cell.v.getFullYear()}-${pad(cell.v.getMonth() + 1)}-${pad(cell.v.getDate())}`;
  if (cell.t === "s") return String(cell.v);
  return cell.w ?? String(cell.v);
}

/** Reads the first sheet of an .xlsx/.xls workbook into the same lowercased-header row shape the CSV parser produces,
 *  so downstream validation/preview code never needs to know which format was uploaded. */
function parseWorkbook(buffer: ArrayBuffer): Sheet {
  const workbook = XLSX.read(buffer, { type: "array", cellNF: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet?.["!ref"]) return { headers: [], rows: [] };
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const grid: string[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const line: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) line.push(cellText(sheet[XLSX.utils.encode_cell({ r, c })]).trim());
    grid.push(line);
  }
  return toSheet(grid.filter((line) => line.some((v) => v !== "")));
}

const asIssue = (e: string | ImportIssue): ImportIssue => (typeof e === "string" ? { message: e } : e);

export function CsvImportDrawer<T>({
  open, onClose, onSubmit, title, itemNoun, templateFilename, templateHeaders, templateSampleRows, templateNumberColumns, templateHowTo, previewColumns, parseRow, color,
}: CsvImportDrawerProps<T>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow<T>[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [chosenFile, setChosenFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [failure, setFailure] = useState("");

  if (!open) return null;

  const validRows = rows?.filter((r) => r.valid) ?? [];
  const invalidRows = rows?.filter((r) => !r.valid) ?? [];
  const common = summarizeIssues(invalidRows.map((r) => r.issues));
  const commonText = common.map((c) => `${c.rows} row${c.rows === 1 ? "" : "s"}: ${c.label}`).join(" · ");

  const handleFile = (file: File) => {
    setFileName(file.name);
    setChosenFile(file);
    const isCsv = /\.csv$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      let sheet: Sheet;
      try {
        sheet = isCsv ? toSheet(parseCsv(e.target?.result as string)) : parseWorkbook(e.target?.result as ArrayBuffer);
      } catch {
        setFailure("This file could not be read. Save it as .xlsx or .csv and try again."); setRows([]); return;
      }
      setFailure(""); setOutcome(null);
      setHeaders(sheet.headers);
      setRows(sheet.rows.map((raw) => {
        const { data, errors } = parseRow(raw);
        const issues = errors.map(asIssue);
        return { raw, data, valid: issues.length === 0, issues };
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
    const numeric = new Set((templateNumberColumns ?? []).map(normalizeHeader));
    // Amount columns are real numbers in General format: no thousands separator, so nothing arrives as text.
    const sample = templateSampleRows.map((line) => line.map((v, i) => (numeric.has(normalizeHeader(templateHeaders[i] ?? "")) && v !== "" && !isNaN(Number(v)) ? Number(v) : v)));
    const ws = XLSX.utils.aoa_to_sheet([templateHeaders, ...sample]);
    for (const [address, cell] of Object.entries(ws)) if (!address.startsWith("!") && (cell as XLSX.CellObject).t === "n") (cell as XLSX.CellObject).z = "General";
    ws["!cols"] = templateHeaders.map((h) => ({ wch: Math.max(12, h.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    if (templateHowTo?.length) {
      const how = XLSX.utils.aoa_to_sheet(templateHowTo.map((line) => [line]));
      how["!cols"] = [{ wch: 110 }];
      XLSX.utils.book_append_sheet(wb, how, "How to use");
    }
    XLSX.writeFile(wb, templateFilename);
  };

  /** The rows that can't be imported, as they were in the file plus an "Error" column, to fix and upload again. */
  const downloadErrors = () => {
    const keys = headers.map(normalizeHeader);
    const lines = invalidRows.map((r) => [...keys.map((k) => r.raw[k] ?? ""), r.issues.map((i) => i.message).join("; ")]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...headers, "Error"], ...lines]), "Errors");
    XLSX.writeFile(wb, `${(fileName.replace(/\.[^.]+$/, "") || templateFilename.replace(/\.[^.]+$/, ""))} - errors.xlsx`);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validRows.length || submitting) return;
    setSubmitting(true); setFailure(""); setStatus("");
    try {
      const result = await onSubmit(validRows.map((r) => r.data), chosenFile ?? undefined, setStatus);
      if (result) setOutcome(result);
      else onClose();
    } catch (cause) {
      setFailure((cause as { detail?: string; message?: string })?.detail ?? (cause as { message?: string })?.message ?? "The import failed. Nothing was saved; please try again.");
    } finally {
      setSubmitting(false); setStatus("");
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={title}
      description={outcome ? "Import finished" : rows ? `${validRows.length} valid · ${invalidRows.length} errors${commonText ? ` · ${commonText}` : ""}` : "Upload an Excel or CSV file"}
      size="lg"
      footer={
        outcome ? (
          <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
        ) : rows && (
          <form onSubmit={submit}>
            <FormFooter
              submitLabel={submitting ? (status || "Importing…") : `Import ${validRows.length} ${itemNoun}${validRows.length !== 1 ? "s" : ""}`}
              onCancel={onClose}
              disabled={validRows.length === 0 || submitting}
              color={color}
            />
          </form>
        )
      }
    >
      <div className="p-5 space-y-4">
        {outcome && (
          <div className="space-y-3" role="status">
            <p className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-sm font-medium text-foreground"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden />{outcome.summary}</p>
            {!!outcome.problems?.length && (
              <div className="rounded-lg border border-border">
                <p className="border-b border-border px-3 py-2 text-xs font-semibold text-muted">Needs a look ({outcome.problems.length})</p>
                <ul className="max-h-72 divide-y divide-border overflow-auto text-sm">{outcome.problems.map((p, i) => <li key={`${p.label}${i}`} className="flex flex-wrap justify-between gap-2 px-3 py-2"><span className="break-all font-medium">{p.label}</span><span className="text-muted">{p.reason}</span></li>)}</ul>
              </div>
            )}
          </div>
        )}
        {submitting && (
          <p role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg border border-border bg-surface/50 px-3 py-2.5 text-sm font-medium text-foreground"><Loader2 size={15} className="animate-spin text-muted" aria-hidden />{status || "Importing…"}</p>
        )}
        {failure && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">{failure}</p>}
        {!outcome && <>
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
            <div className="px-4 py-2.5 bg-surface/50 border-b border-border flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-foreground">Preview — {rows.length} rows</span>
              <button type="button" onClick={() => { setRows(null); setFileName(""); setHeaders([]); }} className="text-xs text-muted hover:text-foreground">Clear</button>
            </div>
            {invalidRows.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-100 bg-red-50 px-4 py-2.5 dark:border-red-900 dark:bg-red-950/30">
                <div className="min-w-0 text-xs text-red-700 dark:text-red-400">
                  <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={13} aria-hidden />{invalidRows.length} row{invalidRows.length === 1 ? "" : "s"} can&apos;t be imported and will be skipped</p>
                  <ul className="mt-1 space-y-0.5">{common.map((c) => <li key={c.label}>{c.rows} row{c.rows === 1 ? "" : "s"}: {c.label}</li>)}</ul>
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={downloadErrors}><Download size={13} aria-hidden />Download error report</Button>
              </div>
            )}
            <div className="overflow-x-auto max-h-96">
              <TableScroll><table className="w-full text-xs">
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
                  {rows.map((row, i) => {
                    const messages = row.issues.map((x) => x.message);
                    const byColumn = new Map<string, string[]>();
                    for (const x of row.issues) if (x.column) byColumn.set(x.column, [...(byColumn.get(x.column) ?? []), x.message]);
                    return [
                      <tr key={`r${i}`} className={row.valid ? "bg-white dark:bg-transparent" : "bg-red-50/60 dark:bg-red-950/20"}>
                        <td className="px-3 py-2">
                          {row.valid
                            ? <CheckCircle2 size={13} className="text-emerald-500" aria-label="Ready to import" />
                            : <span title={messages.join("\n")} role="img" aria-label={`Row ${i + 2} errors: ${messages.join("; ")}`}><XCircle size={13} className="text-red-500" aria-hidden /></span>}
                        </td>
                        {previewColumns.map((c, ci) => {
                          const bad = byColumn.get(c.key);
                          return (
                            <td key={c.key} title={bad?.join("\n")} className={`whitespace-nowrap px-3 py-2 ${c.align === "right" ? "text-right" : ""} ${bad ? "bg-red-100 font-semibold text-red-700 ring-1 ring-inset ring-red-300 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-800" : ci === 0 ? "font-medium text-foreground" : "text-muted"}`}>
                              {row.raw[c.key] || <span className="text-red-400">—</span>}
                            </td>
                          );
                        })}
                      </tr>,
                      !row.valid && (
                        <tr key={`e${i}`} className="bg-red-50/60 dark:bg-red-950/20">
                          <td />
                          <td colSpan={previewColumns.length} className="px-3 pb-2 pt-0">
                            <ul className="sticky left-3 max-w-[calc(100vw-5rem)] space-y-0.5 text-[11px] text-red-700 sm:max-w-[340px] dark:text-red-400">
                              {messages.map((m) => <li key={m}><span className="font-semibold">Row {i + 2}:</span> {m}</li>)}
                            </ul>
                          </td>
                        </tr>
                      ),
                    ];
                  })}
                </tbody>
              </table></TableScroll>
            </div>
          </div>
        )}

        {rows && rows.length === 0 && !failure && (
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
            <FileText size={14} className="text-amber-500" />
            <p className="text-xs text-amber-700 font-medium">No rows found. Make sure the file has a header row and data rows.</p>
          </div>
        )}
        </>}
      </div>
    </Drawer>
  );
}
