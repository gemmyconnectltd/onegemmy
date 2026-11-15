"use client";
import { TableScroll } from "@/components/ui/TableScroll";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Upload, Download, CheckCircle2, XCircle, FileText, Loader2, AlertTriangle, Camera, Sparkles, Undo2, Trash2, Search,
  ChevronLeft, ChevronRight, ImagePlus, RotateCcw, Copy,
} from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Input, Select } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { parseCsv, type ImportIssue } from "@/lib/importValues";
import { autoMap, detectHeaderRow, groupIssues, groupSentence, inFileDuplicates, norm, rowValues, type ColumnMatch, type ImportField, type IssueGroup } from "@/lib/importEngine";
import { importsApi, type ImportAi, type ImportModule, type RowCheck, type SheetPicture } from "@/lib/api/imports";

// Every "Import" in PESAA: Upload -> Review & Fix -> Import, nothing more.
// 1 Upload: the client's own Excel/CSV as it is, or a photo/PDF of their records (read by Pesaa AI). Columns are matched
//   to PESAA's fields automatically, including headings like "Buying Price" or "Item Code" and a title row above them.
// 2 Review & Fix: an editable sheet. Problems shared by many rows are shown once with a fix for all of them; duplicates of
//   existing records are found by the server; uncertain values read from a photo must be checked. Nothing is saved yet.
// 3 Import: a short confirmation, then the result on the same screen. Rows become records only through the module's own
//   bulk import, so permissions, validation, stock and accounting rules stay exactly as they are.

export interface CsvPreviewColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  /** Required fields are marked, and a row without one can't be imported. */
  required?: boolean;
  /** Other headings that mean this field in clients' own files ("Buying Price"). Common ones are already known. */
  aliases?: string[];
  /** Two rows in the same file must not share this value (SKU, email). */
  unique?: boolean;
}

/** What an import ended with, shown on the same screen. `imported`/`failed` default to "all imported". */
export interface ImportOutcome { summary: string; problems?: { label: string; reason: string }[]; imported?: number; failed?: number }

/** Per submitted item, in the same order: the sheet row it came from and, for products, its picture choice
 *  (undefined: keep the pictures pasted into the sheet, null: removed in review, File: chosen in review). */
export interface ImportRowMeta { sheetRow: number; picture?: File | null }

export interface CsvImportDrawerProps<T> {
  open: boolean;
  onClose: () => void;
  onSubmit: (items: T[], file?: File, progress?: (status: string) => void, rows?: ImportRowMeta[]) => Promise<void | ImportOutcome> | void;
  title: string;
  /** Singular noun, e.g. "customer" -> "Import 3 customers". */
  itemNoun: string;
  templateFilename: string;
  templateHeaders: string[];
  templateSampleRows: string[][];
  /** Template columns written as plain numbers (General format); these fields also get "Set all to 0". */
  templateNumberColumns?: string[];
  /** Lines for a "How to use" sheet added after the template sheet. */
  templateHowTo?: string[];
  previewColumns: CsvPreviewColumn[];
  /** Validates + maps one row (keys are field keys; server lookups arrive as _keys such as _category_id). An issue with a `column` highlights that cell. */
  parseRow: (raw: Record<string, string>) => { data: T; errors: (string | ImportIssue)[] };
  /** Turns on the server checks (duplicates of existing records, names resolved to records), drafts and photo/PDF reading. */
  module?: ImportModule;
  /** Products: pictures pasted into the sheet are shown per row and can be replaced or removed. */
  pictures?: boolean;
  /** What importing these items will do to stock, accounts or records, for the confirmation. */
  effects?: (items: T[]) => string[];
  color?: string;
}

/** A module's bulk-import reply ({created, failed, skipped, errors}) as the result shown after importing. */
export function bulkOutcome(noun: string, result: { created: number; failed?: number; skipped?: number; errors?: string[] }): ImportOutcome {
  const plural = (n: number) => `${n} ${noun}${n === 1 ? "" : "s"}`;
  const notDone = (result.failed ?? 0) + (result.skipped ?? 0);
  return {
    summary: `${plural(result.created)} imported${notDone ? `, ${notDone} not imported` : ""}.`,
    imported: result.created, failed: notDone,
    problems: (result.errors ?? []).map((reason) => ({ label: noun[0].toUpperCase() + noun.slice(1), reason })),
  };
}

type Kind = "sheet" | "csv" | "image" | "pdf";
interface Source { fileName: string; kind: Kind; sheets: string[]; sheet: number; note?: string }
interface Snapshot { mapping: ColumnMatch[]; edits: Record<number, Record<string, string>>; removed: number[]; confirmed: Record<number, string[]>; pictureChoice: Record<number, File | null> }
type Filter = "all" | "fix" | "ready" | "duplicate" | "warning" | "removed" | `group:${string}`;
interface Draft { v: 1; savedAt: string; source: Source; grid: string[][]; rowNumbers: number[]; headerRow: number; mapping: ColumnMatch[]; edits: Snapshot["edits"]; removed: number[]; confirmed: Snapshot["confirmed"]; uncertain: Record<number, string[]> }

const SHEET_RE = /\.(xlsx|xls|xlsm|csv)$/i;
const IMAGE_RE = /\.(jpe?g|png|webp|heic|heif)$/i;
const PAGE = 50;
const pad = (n: number) => String(n).padStart(2, "0");
const asIssue = (e: string | ImportIssue): ImportIssue => (typeof e === "string" ? { message: e } : e);
const errorText = (cause: unknown, fallback: string) => (cause as { detail?: string })?.detail ?? (cause as { message?: string })?.message ?? fallback;

/** A cell's stored value rather than the text Excel displays: 2,500 formatted with separators arrives as 2500, long barcodes
 *  aren't in scientific notation, and dates arrive as YYYY-MM-DD whatever the display format. */
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

/** One worksheet as rows of text, with each row's number in the sheet (pictures are anchored to sheet rows). Blank rows are dropped. */
function readSheet(workbook: XLSX.WorkBook, index: number): { grid: string[][]; rowNumbers: number[] } {
  const sheet = workbook.Sheets[workbook.SheetNames[index]];
  if (!sheet?.["!ref"]) return { grid: [], rowNumbers: [] };
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const grid: string[][] = [], rowNumbers: number[] = [];
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 20000); r++) {
    const line: string[] = [];
    for (let c = range.s.c; c <= Math.min(range.e.c, range.s.c + 80); c++) line.push(cellText(sheet[XLSX.utils.encode_cell({ r, c })]).trim());
    if (line.some((v) => v !== "")) { grid.push(line); rowNumbers.push(r + 1); }
  }
  return { grid, rowNumbers };
}

function readFileAs(file: File, as: "text" | "buffer"): Promise<string | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string | ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    if (as === "text") reader.readAsText(file); else reader.readAsArrayBuffer(file);
  });
}

function writeWorkbook(filename: string, sheets: { name: string; rows: (string | number)[][] }[]) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name);
  XLSX.writeFile(wb, filename);
}

export function CsvImportDrawer<T>(props: CsvImportDrawerProps<T>) {
  // Mounted only while open, so every import starts clean.
  if (!props.open) return null;
  return <ImportWorkspace {...props} />;
}

function ImportWorkspace<T>({
  onClose, onSubmit, title, itemNoun, templateFilename, templateHeaders, templateSampleRows, templateNumberColumns, templateHowTo,
  previewColumns, parseRow, module, pictures: withPictures, effects,
}: CsvImportDrawerProps<T>) {
  const { user } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const pictureInput = useRef<HTMLInputElement>(null);
  const pictureFor = useRef<number | null>(null);
  const workbook = useRef<XLSX.WorkBook | null>(null);
  const editStart = useRef<Snapshot | null>(null);
  const submitting = useRef(false);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [grid, setGrid] = useState<string[][]>([]);
  const [rowNumbers, setRowNumbers] = useState<number[]>([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ColumnMatch[]>([]);
  const [edits, setEdits] = useState<Snapshot["edits"]>({});
  const [removed, setRemoved] = useState<number[]>([]);
  const [confirmed, setConfirmed] = useState<Snapshot["confirmed"]>({});
  const [uncertain, setUncertain] = useState<Record<number, string[]>>({});
  const [pictureChoice, setPictureChoice] = useState<Snapshot["pictureChoice"]>({});
  const [sheetPictures, setSheetPictures] = useState<Record<string, SheetPicture[]>>({});
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [checks, setChecks] = useState<Record<number, RowCheck>>({});
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [ai, setAi] = useState<ImportAi | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [reading, setReading] = useState("");
  const [failure, setFailure] = useState("");
  const [dragging, setDragging] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const [bulkField, setBulkField] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [groupValues, setGroupValues] = useState<Record<string, string>>({});
  const [skipConfirmed, setSkipConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [draftSaved, setDraftSaved] = useState("");

  const noun = itemNoun;
  const plural = (n: number, word = noun) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
  const draftKey = module ? `pesaa-import-draft:${user?.tenantId ?? "local"}:${module}` : "";

  // The fields PESAA imports: the preview columns (labels, required) plus any template heading the row parser reads.
  const fields: ImportField[] = useMemo(() => {
    const numeric = new Set((templateNumberColumns ?? []).map(norm));
    const list: ImportField[] = previewColumns.map((c) => ({ key: c.key, label: c.label, required: c.required, align: c.align, aliases: c.aliases, unique: c.unique, numeric: numeric.has(c.key) }));
    for (const heading of templateHeaders) {
      const key = norm(heading);
      if (key && !list.some((f) => f.key === key)) list.push({ key, label: heading, numeric: numeric.has(key) });
    }
    return list;
  }, [previewColumns, templateHeaders, templateNumberColumns]);
  const fieldByKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);

  useEffect(() => {
    if (!module) return;
    let live = true;
    importsApi.ai().then((r) => { if (live) setAi(r.data); }).catch(() => { if (live) setAi(null); });
    return () => { live = false; };
  }, [module]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  // Previews of pictures chosen during review, released when they change or the import closes.
  const chosenUrls = useMemo(() => Object.fromEntries(Object.entries(pictureChoice).filter(([, f]) => f).map(([id, f]) => [id, URL.createObjectURL(f as File)])), [pictureChoice]);
  useEffect(() => () => { for (const url of Object.values(chosenUrls)) URL.revokeObjectURL(url); }, [chosenUrls]);

  const draft: Draft | null = useMemo(() => {
    if (!draftKey || step !== 1) return null;
    try { const raw = localStorage.getItem(draftKey); return raw ? JSON.parse(raw) as Draft : null; } catch { return null; }
  }, [draftKey, step, draftSaved]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Rows as staged: the file's columns as matched, the person's edits, the server's checks ────────────────────
  const headings = grid[headerRow] ?? [];
  const dataIds = useMemo(() => grid.map((_, i) => i).filter((i) => i > headerRow), [grid, headerRow]);
  const removedSet = useMemo(() => new Set(removed), [removed]);

  const staged = useMemo(() => {
    const base = dataIds.map((id) => ({ id, label: source?.kind === "image" || source?.kind === "pdf" ? id - headerRow : rowNumbers[id] ?? id + 1, values: rowValues(grid[id], mapping, edits[id]) }));
    const repeats = inFileDuplicates(base.filter((r) => !removedSet.has(r.id)), fields);
    return base.map((row) => {
      const check = checks[row.id];
      const raw: Record<string, string> = { ...row.values, ...(check?.context ?? {}) };
      const { data, errors } = parseRow(raw);
      const issues: ImportIssue[] = errors.map(asIssue).map((i) => ({ ...i, level: i.level ?? "error" }));
      for (const issue of check?.issues ?? []) issues.push({ ...issue, level: issue.level ?? "error" });
      for (const key of uncertain[row.id] ?? []) {
        if (!(confirmed[row.id] ?? []).includes(key) && fieldByKey.has(key)) {
          issues.push({ column: key, level: "error", message: `${fieldByKey.get(key)!.label}: check this value against the original (Pesaa AI wasn't sure)`, summary: "values to check against the original" });
        }
      }
      const duplicate = check?.duplicate ?? repeats.get(row.id) ?? null;
      const errorCount = issues.filter((i) => i.level === "error").length;
      const isRemoved = removedSet.has(row.id);
      const state = isRemoved ? "removed" : duplicate ? "duplicate" : errorCount ? "fix" : "ready";
      return { ...row, raw, data, issues, duplicate, errors: errorCount, warnings: issues.length - errorCount, state };
    });
  }, [dataIds, grid, mapping, edits, checks, uncertain, confirmed, removedSet, fields, fieldByKey, parseRow, rowNumbers, headerRow, source?.kind]);
  type Row = (typeof staged)[number];

  const active = staged.filter((r) => r.state !== "removed");
  const ready = active.filter((r) => r.state === "ready");
  const toFix = active.filter((r) => r.state === "fix");
  const duplicates = active.filter((r) => r.state === "duplicate");
  const withWarnings = ready.filter((r) => r.warnings > 0);
  const groups = useMemo(() => groupIssues(staged.filter((r) => r.state === "fix" || r.state === "ready").map((r) => ({ id: r.id, issues: r.issues }))), [staged]);

  // Ask the server about duplicates and names (category, brand...) whenever the values change, a moment after typing stops.
  const checkPayload = useMemo(() => (module && step > 1 ? JSON.stringify(dataIds.map((id) => rowValues(grid[id], mapping, edits[id]))) : ""), [module, step, dataIds, grid, mapping, edits]);
  useEffect(() => {
    if (!checkPayload || !module) return;
    let live = true;
    const timer = setTimeout(() => {
      setChecking(true);
      importsApi.check(module, JSON.parse(checkPayload))
        .then((r) => { if (live) { setChecks(Object.fromEntries(r.data.map((c, i) => [dataIds[i], c]))); setCheckFailed(false); } })
        .catch(() => { if (live) setCheckFailed(true); })
        .finally(() => { if (live) setChecking(false); });
    }, 500);
    return () => { live = false; clearTimeout(timer); };
  }, [checkPayload, module]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── history (Undo) ─────────────────────────────────────────────────────────────────────────────────────────────
  const snapshot = (): Snapshot => ({ mapping, edits, removed, confirmed, pictureChoice });
  const remember = (snap = snapshot()) => setHistory((h) => [...h.slice(-29), snap]);
  const undo = () => {
    const last = history.at(-1);
    if (!last) return;
    setMapping(last.mapping); setEdits(last.edits); setRemoved(last.removed); setConfirmed(last.confirmed); setPictureChoice(last.pictureChoice);
    setHistory((h) => h.slice(0, -1));
  };
  const setCells = (ids: number[], key: string, value: string) => {
    remember();
    setEdits((prev) => { const next = { ...prev }; for (const id of ids) next[id] = { ...next[id], [key]: value }; return next; });
  };

  // ── Step 1: reading the upload ─────────────────────────────────────────────────────────────────────────────────
  const start = (g: string[][], numbers: number[], src: Source, unsure: Record<number, string[]> = {}) => {
    if (g.length < 2) { setFailure("No rows were found. The file needs a heading row and at least one row of data."); return; }
    const header = src.kind === "image" || src.kind === "pdf" ? 0 : detectHeaderRow(g, fields);
    setGrid(g); setRowNumbers(numbers); setHeaderRow(header); setMapping(autoMap(g[header], fields)); setSource(src);
    setEdits({}); setRemoved([]); setConfirmed({}); setUncertain(unsure); setPictureChoice({}); setHistory([]); setChecks({});
    setFilter("all"); setPage(0); setSelected(new Set()); setFocusRow(null); setFailure(""); setStep(2);
  };

  const handleFile = async (picked: File) => {
    setFailure(""); setOutcome(null); setSheetPictures({});
    const isImage = picked.type.startsWith("image/") || IMAGE_RE.test(picked.name);
    const isPdf = picked.type === "application/pdf" || /\.pdf$/i.test(picked.name);
    if (!isImage && !isPdf && !SHEET_RE.test(picked.name)) { setFailure("Upload an Excel (.xlsx, .xls) or CSV file, a PDF, or a photo of your records."); return; }
    setFile(picked);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(isImage || isPdf ? URL.createObjectURL(picked) : "");
    if (isImage || isPdf) {
      if (!module || !ai?.available || !(isPdf ? ai.pdf : ai.photos)) {
        setFailure(ai?.reason ?? (isPdf ? "PDFs can't be read on this setup. Take a photo of each page instead, or upload Excel or CSV." : "Photos can't be read on this setup. Upload Excel or CSV."));
        return;
      }
      setReading(isPdf ? "Reading your PDF with Pesaa AI…" : "Reading your photo with Pesaa AI…");
      try {
        const out = (await importsApi.extract(module, fields.map((f) => ({ key: f.key, label: f.label })), picked)).data;
        const unsure: Record<number, string[]> = {};
        for (const [r, c] of out.uncertain) (unsure[r + 1] ??= []).push(fields[c].key);
        // The extraction comes back with PESAA's own field labels as headings, so every column matches exactly.
        start([out.headers, ...out.rows], [0, ...out.rows.map((_, i) => i + 1)], { fileName: picked.name, kind: isPdf ? "pdf" : "image", sheets: [], sheet: 0, note: out.note }, unsure);
        if (!out.rows.length) setFailure("No records were found in this file. Try a sharper, well-lit photo of one page.");
      } catch (cause) {
        setFailure(errorText(cause, "This file couldn't be read. Try again, or upload Excel or CSV."));
      } finally { setReading(""); }
      return;
    }
    setReading("Reading your file…");
    try {
      if (/\.csv$/i.test(picked.name)) {
        const g = parseCsv(await readFileAs(picked, "text") as string);
        workbook.current = null;
        start(g, g.map((_, i) => i + 1), { fileName: picked.name, kind: "csv", sheets: [], sheet: 0 });
      } else {
        const wb = XLSX.read(await readFileAs(picked, "buffer") as ArrayBuffer, { type: "array", cellNF: true });
        workbook.current = wb;
        // The first sheet with data (a cover or instructions sheet first is common), and the "How to use" sheet never.
        const index = Math.max(0, wb.SheetNames.findIndex((name, i) => !/how to use/i.test(name) && readSheet(wb, i).grid.length > 1));
        const { grid: g, rowNumbers: numbers } = readSheet(wb, index);
        start(g, numbers, { fileName: picked.name, kind: "sheet", sheets: wb.SheetNames, sheet: index });
        if (withPictures && /\.xlsx$/i.test(picked.name) && index === 0) {
          importsApi.sheetPictures(picked).then((r) => setSheetPictures(r.data.rows)).catch(() => setSheetPictures({}));
        }
      }
    } catch {
      setFailure("This file couldn't be read. Save it as .xlsx or .csv and try again.");
    } finally { setReading(""); }
  };

  const chooseSheet = (index: number) => {
    const wb = workbook.current;
    if (!wb || !source) return;
    const { grid: g, rowNumbers: numbers } = readSheet(wb, index);
    // Pictures are only read from the first sheet (where the product import looks for them).
    if (index !== 0) setSheetPictures({});
    else if (withPictures && file) importsApi.sheetPictures(file).then((r) => setSheetPictures(r.data.rows)).catch(() => setSheetPictures({}));
    start(g, numbers, { ...source, sheet: index });
  };

  const changeHeaderRow = (row: number) => {
    remember();
    setHeaderRow(row); setMapping(autoMap(grid[row] ?? [], fields)); setChecks({}); setPage(0);
  };

  const setColumnField = (column: number, field: string) => {
    remember();
    setMapping((prev) => prev.map((m, i) => (i === column ? { field, confidence: field ? "manual" : "none" } : m.field === field && field ? { field: "", confidence: "none" } : m)));
  };

  const suggest = async () => {
    if (!module) return;
    const columns = mapping.map((m, i) => ({ m, i })).filter(({ m, i }) => !m.field && headings[i]);
    if (!columns.length) return;
    setSuggesting(true); setFailure("");
    try {
      const used = new Set(mapping.map((m) => m.field).filter(Boolean));
      const open = fields.filter((f) => !used.has(f.key));
      const reply = (await importsApi.suggestMapping(module, open.map((f) => ({ key: f.key, label: f.label })),
        columns.map(({ i }) => ({ header: headings[i], samples: dataIds.slice(0, 3).map((id) => grid[id][i] ?? "").filter(Boolean) })))).data;
      remember();
      setMapping((prev) => prev.map((m, i) => {
        const key = !m.field ? reply[headings[i]] : null;
        return key && !prev.some((p) => p.field === key) ? { field: key, confidence: "ai" } : m;
      }));
    } catch (cause) {
      setFailure(errorText(cause, "Pesaa AI couldn't suggest matches right now. Choose the fields from the lists."));
    } finally { setSuggesting(false); }
  };

  // ── Drafts ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const saveDraft = () => {
    if (!draftKey || !source) return;
    const value: Draft = { v: 1, savedAt: new Date().toISOString(), source, grid, rowNumbers, headerRow, mapping, edits, removed, confirmed, uncertain };
    try { localStorage.setItem(draftKey, JSON.stringify(value)); setDraftSaved(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })); }
    catch { setFailure("The draft couldn't be saved in this browser (storage is full or blocked)."); }
  };
  const resumeDraft = (d: Draft) => {
    setFile(null); setPreviewUrl(""); setSheetPictures({}); workbook.current = null;
    setGrid(d.grid); setRowNumbers(d.rowNumbers); setHeaderRow(d.headerRow); setMapping(d.mapping); setSource(d.source);
    setEdits(d.edits); setRemoved(d.removed); setConfirmed(d.confirmed); setUncertain(d.uncertain); setPictureChoice({}); setHistory([]); setChecks({});
    setFilter("all"); setPage(0); setSelected(new Set()); setFailure(""); setStep(2);
  };
  const discardDraft = () => { try { localStorage.removeItem(draftKey); } catch { /* storage blocked: nothing to discard */ } setDraftSaved(`discarded ${Date.now()}`); };

  // ── Reports ────────────────────────────────────────────────────────────────────────────────────────────────────
  const reportRows = (rows: Row[]) => rows.map((r) => [r.label, ...headings.map((_, i) => (mapping[i]?.field ? r.values[mapping[i].field] ?? "" : grid[r.id][i] ?? "")),
    r.duplicate ? `Skipped: ${r.duplicate}` : r.issues.filter((i) => i.level === "error").map((i) => i.message).join("; ")]);
  const downloadReport = () => {
    const base = (source?.fileName ?? templateFilename).replace(/\.[^.]+$/, "");
    const sheets = [{ name: "Not imported", rows: [["Row", ...headings, "Reason"], ...reportRows([...toFix, ...duplicates])] }];
    if (outcome?.problems?.length) sheets.push({ name: "Failed on import", rows: [["Record", "Reason"], ...outcome.problems.map((p) => [p.label, p.reason])] });
    writeWorkbook(`${base} - errors.xlsx`, sheets);
  };
  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const numeric = new Set((templateNumberColumns ?? []).map(norm));
    const sample = templateSampleRows.map((line) => line.map((v, i) => (numeric.has(norm(templateHeaders[i] ?? "")) && v !== "" && !isNaN(Number(v)) ? Number(v) : v)));
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

  // ── Step 3: import ─────────────────────────────────────────────────────────────────────────────────────────────
  const runImport = async () => {
    if (submitting.current || !ready.length) return;
    submitting.current = true; setBusy(true); setFailure(""); setStatus("");
    try {
      const meta: ImportRowMeta[] = ready.map((r) => ({ sheetRow: rowNumbers[r.id] ?? 0, picture: r.id in pictureChoice ? pictureChoice[r.id] : undefined }));
      const result = await onSubmit(ready.map((r) => r.data), file ?? undefined, setStatus, meta);
      setOutcome(result ?? { summary: `${plural(ready.length)} imported.`, imported: ready.length, failed: 0 });
      if (draftKey) try { localStorage.removeItem(draftKey); } catch { /* nothing saved */ }
    } catch (cause) {
      setFailure(errorText(cause, "The import failed and nothing was saved. Please try again."));
    } finally {
      submitting.current = false; setBusy(false); setStatus("");
    }
  };

  // ── Review table data ──────────────────────────────────────────────────────────────────────────────────────────
  const group = filter.startsWith("group:") ? groups.find((g) => `group:${g.key}` === filter) : undefined;
  const inGroup = group ? new Set(group.ids) : null;
  const q = query.trim().toLowerCase();
  const visible = staged.filter((r) => {
    if (filter === "removed" ? r.state !== "removed" : r.state === "removed") return false;
    if (filter === "fix" && r.state !== "fix") return false;
    if (filter === "ready" && r.state !== "ready") return false;
    if (filter === "duplicate" && r.state !== "duplicate") return false;
    if (filter === "warning" && !(r.state === "ready" && r.warnings)) return false;
    if (inGroup && !inGroup.has(r.id)) return false;
    return !q || Object.values(r.values).some((v) => v.toLowerCase().includes(q));
  });
  const pages = Math.max(1, Math.ceil(visible.length / PAGE));
  const current = Math.min(page, pages - 1);
  const pageRows = visible.slice(current * PAGE, current * PAGE + PAGE);
  const mappedKeys = new Set(mapping.map((m) => m.field).filter(Boolean));
  const editedKeys = new Set(Object.values(edits).flatMap((e) => Object.keys(e)));
  const columns = fields.filter((f) => mappedKeys.has(f.key) || f.required || editedKeys.has(f.key));
  const missingRequired = fields.filter((f) => f.required && !mappedKeys.has(f.key));
  const toCheck = mapping.filter((m, i) => headings[i] && (m.confidence === "likely" || m.confidence === "ai")).length;
  const unmatched = mapping.filter((m, i) => headings[i] && !m.field).length;
  const pictureRows = withPictures && (Object.keys(sheetPictures).length > 0 || Object.keys(pictureChoice).length > 0);
  const focused = staged.find((r) => r.id === focusRow) ?? toFix[0] ?? staged[0];

  const pictureOf = (row: Row): { preview: string | null; count: number; problem: string | null; chosen: boolean } => {
    if (row.id in pictureChoice) {
      const chosen = pictureChoice[row.id];
      return { preview: chosen ? chosenUrls[row.id] ?? null : null, count: chosen ? 1 : 0, problem: null, chosen: true };
    }
    const list = sheetPictures[String(rowNumbers[row.id])] ?? [];
    return { preview: list.find((p) => p.preview)?.preview ?? null, count: list.length, problem: list.find((p) => p.problem)?.problem ?? null, chosen: false };
  };

  const toggleSelected = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const removeRows = (ids: number[]) => { remember(); setRemoved((prev) => [...new Set([...prev, ...ids])]); setSelected(new Set()); };
  const restoreRows = (ids: number[]) => { remember(); setRemoved((prev) => prev.filter((id) => !ids.includes(id))); };
  const confirmChecked = (ids: number[]) => {
    remember();
    setConfirmed((prev) => { const next = { ...prev }; for (const id of ids) next[id] = [...new Set([...(next[id] ?? []), ...(uncertain[id] ?? [])])]; return next; });
  };

  const cellProblem = (row: Row, key: string) => {
    const list = row.issues.filter((i) => i.column === key);
    if (!list.length) return null;
    return { level: list.some((i) => i.level === "error") ? "error" : "warning", text: list.map((i) => i.message).join("\n") };
  };

  const readyWarnings = step === 3 ? groupIssues(ready.map((r) => ({ id: r.id, issues: r.issues.filter((i) => i.level === "warning") }))) : [];
  const effectLines = step === 3 && effects ? effects(ready.map((r) => r.data)) : [];
  const stepNames = ["Upload", "Review & Fix", "Import"];
  const description = outcome ? "Import finished" : step === 1 ? "Upload your file as it is: Excel, CSV, a PDF or a photo" : step === 2
    ? `${plural(ready.length)} ready${toFix.length ? ` · ${toFix.length} to fix` : ""}${duplicates.length ? ` · ${duplicates.length} duplicate${duplicates.length === 1 ? "" : "s"}` : ""}`
    : "Check and import";

  // ── Render ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const footer = outcome ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {(toFix.length + duplicates.length > 0 || !!outcome.problems?.length) && <Button variant="secondary" onClick={downloadReport}><Download size={14} aria-hidden />Download error report</Button>}
      <Button onClick={onClose}>View imported {noun}s</Button>
    </div>
  ) : step === 1 ? (
    <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Cancel</Button></div>
  ) : step === 2 ? (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" onClick={() => { setStep(1); setFailure(""); }}><ChevronLeft size={14} aria-hidden />Back</Button>
      {draftKey && <Button variant="secondary" onClick={saveDraft}>{draftSaved && !draftSaved.startsWith("discarded") ? `Draft saved ${draftSaved}` : "Save draft"}</Button>}
      <Button className="ml-auto" disabled={!ready.length || missingRequired.length > 0} onClick={() => { setSkipConfirmed(false); setStep(3); }}>
        Continue with {plural(ready.length)}<ChevronRight size={14} aria-hidden />
      </Button>
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" disabled={busy} onClick={() => setStep(2)}><ChevronLeft size={14} aria-hidden />Back</Button>
      <Button className="ml-auto" disabled={busy || !ready.length || (toFix.length > 0 && !skipConfirmed)} onClick={runImport}>
        {busy ? <><Loader2 size={14} className="animate-spin" aria-hidden />{status || "Importing…"}</> : `Import ${plural(ready.length)} now`}
      </Button>
    </div>
  );

  return (
    <Drawer open onClose={onClose} title={title} description={description} side="center" size="document" footer={footer} trackChanges={false} dirty={step > 1 && !outcome}>
      <input ref={fileInput} type="file" className="hidden" accept=".xlsx,.xls,.xlsm,.csv,.pdf,image/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void handleFile(f); }} />
      <input ref={cameraInput} type="file" className="hidden" accept="image/*" capture="environment" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void handleFile(f); }} />
      <input ref={pictureInput} type="file" className="hidden" accept="image/jpeg,image/png,image/webp" onChange={(e) => {
        const f = e.target.files?.[0]; e.target.value = ""; const id = pictureFor.current;
        if (f && id !== null) { remember(); setPictureChoice((p) => ({ ...p, [id]: f })); }
      }} />
      <div className="space-y-4 p-4 sm:p-5">
        <ol className="flex items-center gap-2 text-xs font-semibold" aria-label="Import steps">
          {stepNames.map((name, i) => {
            const n = (i + 1) as 1 | 2 | 3;
            const done = step > n || !!outcome;
            return (
              <li key={name} aria-current={step === n && !outcome ? "step" : undefined} className="flex min-w-0 flex-1 items-center gap-2">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${step === n && !outcome ? "border-accent bg-accent text-white" : done ? "border-accent text-accent" : "border-border text-muted"}`}>
                  {done ? <CheckCircle2 size={14} aria-hidden /> : n}
                </span>
                <span className={`truncate ${step === n ? "text-foreground" : "text-muted"}`}>{name}</span>
                {i < 2 && <span className="h-px flex-1 bg-border" aria-hidden />}
              </li>
            );
          })}
        </ol>

        {failure && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">{failure}</p>}

        {/* ── Step 1: Upload ── */}
        {step === 1 && (
          <div className="space-y-4">
            {draft && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface/50 px-4 py-3">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-foreground">Continue your saved import?</p>
                  <p className="text-xs text-muted">{draft.source.fileName} · {plural(Math.max(0, draft.grid.length - draft.headerRow - 1 - draft.removed.length), "row")} · saved {new Date(draft.savedAt).toLocaleString()}{draft.source.kind === "image" || draft.source.kind === "pdf" || withPictures ? " · the original file and its pictures aren't kept in drafts" : ""}</p>
                </div>
                <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={discardDraft}>Discard</Button><Button size="sm" onClick={() => resumeDraft(draft)}>Continue</Button></div>
              </div>
            )}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) void handleFile(f); }}
              className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors sm:p-8 ${dragging ? "border-accent bg-accent/5" : "border-border"}`}
            >
              {reading ? (
                <p role="status" aria-live="polite" className="flex items-center justify-center gap-2 text-sm font-medium text-foreground"><Loader2 size={16} className="animate-spin text-muted" aria-hidden />{reading}</p>
              ) : (
                <>
                  <Upload size={26} className="mx-auto mb-2 text-muted" aria-hidden />
                  <p className="text-sm font-semibold text-foreground">Drop your file here</p>
                  <p className="mx-auto mt-1 max-w-md text-xs text-muted">Your own Excel or CSV works as it is: PESAA recognises your columns. You can also upload a PDF or a photo of your records{module && ai && !ai.photos ? " (needs Pesaa AI, not connected yet)" : ""}.</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Button onClick={() => fileInput.current?.click()}><FileText size={14} aria-hidden />Choose file</Button>
                    {module && ai?.photos && <Button variant="secondary" onClick={() => cameraInput.current?.click()}><Camera size={14} aria-hidden />Take a photo</Button>}
                  </div>
                </>
              )}
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="mb-1 text-sm font-semibold text-foreground">What PESAA reads</p>
              <p className="mb-3 text-xs text-muted">Your headings don&apos;t need to match. <span className="font-semibold text-foreground">Bold</span> ones are required.</p>
              <div className="flex flex-wrap gap-1.5">
                {previewColumns.map((c) => <span key={c.key} className={`rounded-full border px-2.5 py-1 text-[11px] ${c.required ? "border-accent font-semibold text-foreground" : "border-border text-muted"}`}>{c.label}</span>)}
              </div>
              <button type="button" onClick={downloadTemplate} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"><Download size={13} aria-hidden />Optional: download the PESAA Excel template</button>
            </div>
          </div>
        )}

        {/* ── Step 2: Review & Fix ── */}
        {step === 2 && source && (
          <div className="space-y-3">
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {([["Total", active.length, "all"], ["Ready", ready.length, "ready"], ["To fix", toFix.length, "fix"], ["Duplicates", duplicates.length, "duplicate"], ["Warnings", withWarnings.length, "warning"]] as const).map(([label, n, f]) => (
                <button key={label} type="button" onClick={() => { setFilter(f); setPage(0); }} aria-pressed={filter === f}
                  className={`rounded-lg border px-3 py-2 text-left ${filter === f ? "border-accent bg-accent/5" : "border-border hover:bg-surface/60"}`}>
                  <dt className="text-[11px] text-muted">{label}</dt>
                  <dd className={`text-lg font-semibold tabular-nums ${f === "fix" && n ? "text-red-600 dark:text-red-400" : f === "duplicate" && n ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>{n.toLocaleString()}</dd>
                </button>
              ))}
            </dl>
            <p className="text-xs text-muted" aria-live="polite">
              {source.fileName}{source.kind === "image" || source.kind === "pdf" ? " · read by Pesaa AI: values are copied as written, never calculated" : ""}
              {checking ? " · checking against your records…" : checkFailed ? " · couldn't check for existing records; duplicates will be refused on import" : ""}
              {source.note ? ` · ${source.note}` : ""}
            </p>

            {/* Column matching: compact, opens itself when something needs a decision. */}
            <details className="rounded-lg border border-border" open={missingRequired.length > 0 || toCheck > 0 || undefined}>
              <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-semibold text-foreground">
                Columns: {mapping.filter((m) => m.field).length} matched{toCheck ? ` · ${toCheck} to check` : ""}{unmatched ? ` · ${unmatched} not imported` : ""}
                {missingRequired.length > 0 && <span className="ml-1 text-red-600 dark:text-red-400">· missing {missingRequired.map((f) => f.label).join(", ")}</span>}
              </summary>
              <div className="space-y-3 border-t border-border px-4 py-3">
                <div className="flex flex-wrap gap-3 text-xs">
                  {source.sheets.length > 1 && (
                    <label className="flex items-center gap-2">Sheet<Select aria-label="Sheet" className="!h-8 !w-auto !text-xs" value={source.sheet} onChange={(e) => chooseSheet(Number(e.target.value))}>{source.sheets.map((s, i) => <option key={s} value={i}>{s}</option>)}</Select></label>
                  )}
                  {source.kind !== "image" && source.kind !== "pdf" && (
                    <label className="flex items-center gap-2">Headings are on row<Select aria-label="Heading row" className="!h-8 !w-auto !text-xs" value={headerRow} onChange={(e) => changeHeaderRow(Number(e.target.value))}>{grid.slice(0, 10).map((_, i) => <option key={i} value={i}>{rowNumbers[i] ?? i + 1}</option>)}</Select></label>
                  )}
                  {module && ai?.mapping && unmatched > 0 && (
                    <Button size="sm" variant="secondary" disabled={suggesting} onClick={suggest}>{suggesting ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Sparkles size={13} aria-hidden />}Suggest matches with Pesaa AI</Button>
                  )}
                </div>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {headings.map((heading, i) => {
                    const m = mapping[i] ?? { field: "", confidence: "none" };
                    const sample = dataIds.map((id) => grid[id][i]).find(Boolean) ?? "";
                    const badge = m.confidence === "likely" ? "Check" : m.confidence === "ai" ? "AI suggestion" : m.confidence === "exact" ? "Auto" : m.confidence === "manual" ? "Chosen" : "Not imported";
                    return (
                      <li key={`${i}-${heading}`} className={`rounded-lg border px-3 py-2 ${m.confidence === "likely" || m.confidence === "ai" ? "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20" : "border-border"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-xs font-semibold text-foreground" title={heading}>{heading || `Column ${i + 1}`}</span>
                          <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide ${m.confidence === "likely" || m.confidence === "ai" ? "text-amber-700 dark:text-amber-400" : "text-muted"}`}>{badge}</span>
                        </div>
                        {sample && <p className="truncate text-[11px] text-muted" title={sample}>e.g. {sample}</p>}
                        <Select aria-label={`PESAA field for column ${heading || i + 1}`} className="mt-1.5 !h-8 !text-xs" value={m.field} onChange={(e) => setColumnField(i, e.target.value)}>
                          <option value="">Don&apos;t import this column</option>
                          {fields.map((f) => <option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</option>)}
                        </Select>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </details>

            {/* Problems grouped across rows, each with a fix for all of them. */}
            {(groups.length > 0 || duplicates.length > 0) && (
              <div className="rounded-lg border border-border">
                <p className="border-b border-border px-4 py-2.5 text-sm font-semibold text-foreground">Needs attention</p>
                <ul className="divide-y divide-border">
                  {duplicates.length > 0 && (
                    <li className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                      <Copy size={14} className="shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                      <span className="min-w-0 flex-1">{plural(duplicates.length)} already exist{duplicates.length === 1 ? "s" : ""} in PESAA or repeat{duplicates.length === 1 ? "s" : ""} in the file. They&apos;re skipped, existing records aren&apos;t changed.</span>
                      <Button size="sm" variant="ghost" onClick={() => { setFilter("duplicate"); setPage(0); }}>Show</Button>
                    </li>
                  )}
                  {groups.map((g) => <GroupRow key={g.key} group={g} noun={noun} field={g.column ? fieldByKey.get(g.column) : undefined} value={groupValues[g.key] ?? ""}
                    onValue={(v) => setGroupValues((s) => ({ ...s, [g.key]: v }))}
                    onApply={(v) => g.column && setCells(g.ids, g.column, v)}
                    onShow={() => { setFilter(`group:${g.key}`); setPage(0); }}
                    onConfirm={g.label === "values to check against the original" ? () => confirmChecked(g.ids) : undefined} />)}
                </ul>
              </div>
            )}

            {/* Original source beside the extracted rows. */}
            {(previewUrl || focused) && (
              <details className="rounded-lg border border-border" open={source.kind === "image" || source.kind === "pdf" || undefined}>
                <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-semibold text-foreground">Original {source.kind === "image" ? "photo" : source.kind === "pdf" ? "PDF" : focused ? `row ${focused.label}` : "file"}</summary>
                <div className="border-t border-border p-3">
                  {source.kind === "image" && previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <div className="max-h-96 overflow-auto rounded-md bg-surface"><img src={previewUrl} alt={`Uploaded photo ${source.fileName}`} className="w-full" /></div>
                  ) : source.kind === "pdf" && previewUrl ? (
                    <object data={previewUrl} type="application/pdf" className="h-96 w-full rounded-md" aria-label={`Uploaded PDF ${source.fileName}`}><a href={previewUrl} target="_blank" rel="noreferrer" className="text-sm text-accent underline">Open the PDF</a></object>
                  ) : (source.kind === "image" || source.kind === "pdf") ? (
                    <p className="text-xs text-muted">The original isn&apos;t kept in saved drafts.</p>
                  ) : focused ? (
                    <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                      {headings.map((h, i) => (grid[focused.id][i] ? <div key={i} className="flex min-w-0 gap-2"><dt className="shrink-0 text-muted">{h || `Column ${i + 1}`}</dt><dd className="truncate font-medium text-foreground" title={grid[focused.id][i]}>{grid[focused.id][i]}</dd></div> : null))}
                    </dl>
                  ) : null}
                </div>
              </details>
            )}

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-0 flex-1 sm:max-w-xs">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                <Input aria-label="Search rows" placeholder="Search rows…" className="!pl-8" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} />
              </label>
              <Select aria-label="Show rows" className="!w-auto" value={filter.startsWith("group:") ? "group" : filter} onChange={(e) => { setFilter(e.target.value as Filter); setPage(0); }}>
                <option value="all">All rows</option><option value="fix">To fix</option><option value="ready">Ready</option><option value="duplicate">Duplicates</option><option value="warning">With warnings</option><option value="removed">Removed ({removed.length})</option>
                {group && <option value="group">{group.label}</option>}
              </Select>
              <Button size="sm" variant="ghost" disabled={!history.length} onClick={undo}><Undo2 size={14} aria-hidden />Undo</Button>
              {(toFix.length + duplicates.length > 0) && <Button size="sm" variant="ghost" onClick={downloadReport}><Download size={14} aria-hidden />Rows not imported</Button>}
            </div>

            {selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-sm">
                <span className="font-semibold">{selected.size} selected</span>
                <Select aria-label="Field to set for selected rows" className="!h-8 !w-auto !text-xs" value={bulkField} onChange={(e) => setBulkField(e.target.value)}>
                  <option value="">Set a field…</option>{fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </Select>
                {bulkField && <><Input aria-label="Value for selected rows" className="!h-8 !w-36 !text-xs" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} /><Button size="sm" onClick={() => { setCells([...selected], bulkField, bulkValue); setBulkValue(""); }}>Apply</Button></>}
                {filter === "removed"
                  ? <Button size="sm" variant="secondary" onClick={() => { restoreRows([...selected]); setSelected(new Set()); }}><RotateCcw size={13} aria-hidden />Restore</Button>
                  : <Button size="sm" variant="secondary" onClick={() => removeRows([...selected])}><Trash2 size={13} aria-hidden />Remove</Button>}
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
              </div>
            )}

            {/* Editable sheet (desktop) */}
            <div className="hidden overflow-hidden rounded-lg border border-border md:block">
              <TableScroll label="Rows to import">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface/40 text-left">
                      <th className="w-8 px-2 py-2"><input type="checkbox" aria-label="Select rows on this page" checked={allOnPage} onChange={() => setSelected((s) => { const n = new Set(s); for (const r of pageRows) { if (allOnPage) n.delete(r.id); else n.add(r.id); } return n; })} /></th>
                      <th className="px-2 py-2 font-semibold text-muted">Row</th>
                      {pictureRows && <th className="px-2 py-2 font-semibold text-muted">Picture</th>}
                      {columns.map((c) => <th key={c.key} className={`whitespace-nowrap px-2 py-2 font-semibold text-muted ${c.align === "right" ? "text-right" : ""}`}>{c.label}{c.required && <span className="text-red-500"> *</span>}</th>)}
                      <th className="px-2 py-2"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pageRows.map((row) => (
                      <tr key={row.id} className={row.state === "fix" ? "bg-red-50/50 dark:bg-red-950/15" : row.state === "duplicate" ? "bg-amber-50/50 dark:bg-amber-950/15" : ""} onFocusCapture={() => setFocusRow(row.id)}>
                        <td className="px-2 py-1.5"><input type="checkbox" aria-label={`Select row ${row.label}`} checked={selected.has(row.id)} onChange={() => toggleSelected(row.id)} /></td>
                        <td className="whitespace-nowrap px-2 py-1.5"><RowState row={row} /></td>
                        {pictureRows && <td className="px-2 py-1.5"><PictureCell picture={pictureOf(row)} label={row.label} onPick={() => { pictureFor.current = row.id; pictureInput.current?.click(); }} onRemove={() => { remember(); setPictureChoice((p) => ({ ...p, [row.id]: null })); }} /></td>}
                        {columns.map((c) => {
                          const problem = cellProblem(row, c.key);
                          return (
                            <td key={c.key} className="px-1 py-1">
                              <input
                                aria-label={`${c.label}, row ${row.label}`} aria-invalid={problem?.level === "error" || undefined} title={problem?.text}
                                value={row.values[c.key] ?? ""} disabled={row.state === "removed"}
                                onFocus={() => { editStart.current = snapshot(); }}
                                onChange={(e) => { const v = e.target.value; setEdits((p) => ({ ...p, [row.id]: { ...p[row.id], [c.key]: v } })); }}
                                onBlur={() => { const s = editStart.current; if (s && s.edits !== edits) remember(s); editStart.current = null; }}
                                style={{ minWidth: c.key === "name" || c.key === "title" ? 176 : c.align === "right" ? 88 : 120 }}
                                className={`h-8 w-full rounded-md border bg-transparent px-2 text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent ${c.align === "right" ? "text-right tabular-nums" : ""} ${problem?.level === "error" ? "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300" : problem ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" : "border-transparent hover:border-border"}`}
                              />
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5 text-right">
                          {row.state === "removed"
                            ? <Button size="sm" variant="ghost" aria-label={`Restore row ${row.label}`} onClick={() => restoreRows([row.id])}><RotateCcw size={13} aria-hidden /></Button>
                            : <Button size="sm" variant="ghost" aria-label={`Remove row ${row.label}`} onClick={() => removeRows([row.id])}><Trash2 size={13} aria-hidden /></Button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </div>

            {/* Record-by-record editing (phones) */}
            <ul className="space-y-3 md:hidden" aria-label="Rows to import">
              {pageRows.map((row) => (
                <li key={row.id} className={`rounded-xl border p-3 ${row.state === "fix" ? "border-red-200 dark:border-red-900" : row.state === "duplicate" ? "border-amber-200 dark:border-amber-900" : "border-border"}`}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelected(row.id)} aria-label={`Select row ${row.label}`} /><RowState row={row} /></label>
                    {row.state === "removed"
                      ? <Button size="sm" variant="ghost" onClick={() => restoreRows([row.id])}><RotateCcw size={13} aria-hidden />Restore</Button>
                      : <Button size="sm" variant="ghost" onClick={() => removeRows([row.id])}><Trash2 size={13} aria-hidden />Remove</Button>}
                  </div>
                  {pictureRows && <div className="mb-2"><PictureCell picture={pictureOf(row)} label={row.label} onPick={() => { pictureFor.current = row.id; pictureInput.current?.click(); }} onRemove={() => { remember(); setPictureChoice((p) => ({ ...p, [row.id]: null })); }} /></div>}
                  <div className="grid grid-cols-2 gap-2">
                    {columns.map((c) => {
                      const problem = cellProblem(row, c.key);
                      return (
                        <label key={c.key} className="min-w-0 text-[11px] text-muted">
                          {c.label}{c.required && <span className="text-red-500"> *</span>}
                          <Input value={row.values[c.key] ?? ""} aria-invalid={problem?.level === "error" || undefined} disabled={row.state === "removed"}
                            onFocus={() => { editStart.current = snapshot(); }}
                            onChange={(e) => { const v = e.target.value; setEdits((p) => ({ ...p, [row.id]: { ...p[row.id], [c.key]: v } })); }}
                            onBlur={() => { const s = editStart.current; if (s && s.edits !== edits) remember(s); editStart.current = null; }}
                            className={problem?.level === "error" ? "!border-red-300 dark:!border-red-800" : problem ? "!border-amber-300 dark:!border-amber-800" : ""} />
                          {problem && <span className={`mt-0.5 block ${problem.level === "error" ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>{problem.text}</span>}
                        </label>
                      );
                    })}
                  </div>
                  {row.issues.filter((i) => !i.column || !columns.some((c) => c.key === i.column)).map((i) => <p key={i.message} className="mt-2 text-[11px] text-red-600 dark:text-red-400">{i.message}</p>)}
                </li>
              ))}
            </ul>

            {!pageRows.length && <p className="rounded-lg border border-border px-4 py-6 text-center text-sm text-muted">{q ? "No rows match your search." : filter === "removed" ? "No rows were removed." : "Nothing here."}</p>}
            {pages > 1 && (
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Rows {current * PAGE + 1}–{Math.min(visible.length, current * PAGE + PAGE)} of {visible.length.toLocaleString()}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft size={14} aria-hidden /></Button>
                  <Button size="sm" variant="secondary" aria-label="Next page" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}><ChevronRight size={14} aria-hidden /></Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Import ── */}
        {step === 3 && !outcome && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label={`${noun[0].toUpperCase()}${noun.slice(1)}s to create`} value={ready.length} strong />
              <Stat label="Existing records updated" value={0} hint="Imports never change existing records" />
              <Stat label="Skipped" value={toFix.length + duplicates.length + removed.length} hint={[toFix.length && `${toFix.length} to fix`, duplicates.length && `${duplicates.length} duplicates`, removed.length && `${removed.length} removed`].filter(Boolean).join(", ")} />
              <Stat label="Warnings" value={withWarnings.length} />
            </dl>
            {readyWarnings.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
                {readyWarnings.map((g) => <li key={g.key} className="flex gap-2"><AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />{groupSentence(g, noun)}</li>)}
              </ul>
            )}
            {effectLines.length > 0 && (
              <div className="rounded-lg border border-border px-4 py-3">
                <p className="mb-1 text-sm font-semibold text-foreground">What this import does</p>
                <ul className="list-disc space-y-1 pl-5 text-xs text-muted">{effectLines.map((line) => <li key={line}>{line}</li>)}</ul>
              </div>
            )}
            {toFix.length > 0 && (
              <label className="flex items-start gap-3 rounded-lg border border-border px-4 py-3 text-sm">
                <input type="checkbox" className="mt-0.5" checked={skipConfirmed} onChange={(e) => setSkipConfirmed(e.target.checked)} />
                <span>Import only the {plural(ready.length, `ready ${noun}`)} and skip the {plural(toFix.length, "row")} that still {toFix.length === 1 ? "needs" : "need"} fixing. You can download those rows after importing, fix them and import them again.</span>
              </label>
            )}
            {busy && <p role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg border border-border bg-surface/50 px-3 py-2.5 text-sm font-medium text-foreground"><Loader2 size={15} className="animate-spin text-muted" aria-hidden />{status || "Importing…"}</p>}
          </div>
        )}

        {outcome && (
          <div className="space-y-3" role="status">
            <dl className="grid grid-cols-3 gap-2">
              <Stat label="Imported" value={outcome.imported ?? ready.length} strong />
              <Stat label="Skipped" value={toFix.length + duplicates.length + removed.length} />
              <Stat label="Failed" value={outcome.failed ?? 0} />
            </dl>
            <p className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-sm font-medium text-foreground"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden />{outcome.summary}</p>
            {!!outcome.problems?.length && (
              <div className="rounded-lg border border-border">
                <p className="border-b border-border px-3 py-2 text-xs font-semibold text-muted">Needs a look ({outcome.problems.length})</p>
                <ul className="max-h-72 divide-y divide-border overflow-auto text-sm">{outcome.problems.map((p, i) => <li key={`${p.label}${i}`} className="flex flex-wrap justify-between gap-2 px-3 py-2"><span className="break-all font-medium">{p.label}</span><span className="text-muted">{p.reason}</span></li>)}</ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}

function Stat({ label, value, hint, strong }: { label: string; value: number; hint?: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`text-lg font-semibold tabular-nums ${strong ? "text-accent" : "text-foreground"}`}>{value.toLocaleString()}</dd>
      {hint && <p className="text-[10px] text-muted">{hint}</p>}
    </div>
  );
}

function RowState({ row }: { row: { label: number; state: string; duplicate: string | null; issues: ImportIssue[]; warnings: number } }) {
  const errors = row.issues.filter((i) => i.level === "error").map((i) => i.message);
  const text = row.state === "duplicate" ? `Skipped: ${row.duplicate}` : row.state === "fix" ? errors.join("\n") : row.state === "removed" ? "Removed" : row.warnings ? row.issues.map((i) => i.message).join("\n") : "Ready to import";
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-foreground" title={text} aria-label={`Row ${row.label}: ${text}`}>
      {row.state === "ready" && !row.warnings && <CheckCircle2 size={13} className="text-emerald-500" aria-hidden />}
      {row.state === "ready" && row.warnings > 0 && <AlertTriangle size={13} className="text-amber-500" aria-hidden />}
      {row.state === "fix" && <XCircle size={13} className="text-red-500" aria-hidden />}
      {row.state === "duplicate" && <Copy size={13} className="text-amber-500" aria-hidden />}
      {row.state === "removed" && <Trash2 size={13} className="text-muted" aria-hidden />}
      {row.label}
    </span>
  );
}

function PictureCell({ picture, label, onPick, onRemove }: { picture: { preview: string | null; count: number; problem: string | null; chosen: boolean }; label: number; onPick: () => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {picture.preview
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={picture.preview} alt={`Picture for row ${label}`} className="h-9 w-9 shrink-0 rounded-md border border-border object-cover" />
        : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted" title={picture.problem ?? "No picture"}><ImagePlus size={14} aria-hidden /></span>}
      {picture.count > 1 && <span className="text-[10px] text-muted">+{picture.count - 1}</span>}
      <button type="button" onClick={onPick} className="text-[11px] font-semibold text-accent hover:underline" aria-label={`${picture.preview ? "Replace" : "Add"} picture for row ${label}`}>{picture.preview ? "Replace" : "Add"}</button>
      {picture.preview && <button type="button" onClick={onRemove} className="text-[11px] text-muted hover:text-foreground" aria-label={`Remove picture for row ${label}`}>Remove</button>}
      {picture.problem && !picture.preview && <span className="sr-only">{picture.problem}</span>}
    </div>
  );
}

function GroupRow({ group, noun, field, value, onValue, onApply, onShow, onConfirm }: {
  group: IssueGroup; noun: string; field?: ImportField; value: string;
  onValue: (v: string) => void; onApply: (v: string) => void; onShow: () => void; onConfirm?: () => void;
}) {
  const missing = /^missing /i.test(group.label);
  const optionalWarning = group.level === "warning" && field && !field.required;
  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
      {group.level === "error" ? <XCircle size={14} className="shrink-0 text-red-500" aria-hidden /> : <AlertTriangle size={14} className="shrink-0 text-amber-500" aria-hidden />}
      <span className="min-w-0 flex-1" title={group.example}>{groupSentence(group, noun)}{group.level === "warning" ? " (can be imported)" : ""}</span>
      {onConfirm && <Button size="sm" variant="secondary" onClick={onConfirm}>I checked them</Button>}
      {field && missing && field.numeric && <Button size="sm" variant="secondary" onClick={() => onApply("0")}>Set all to 0</Button>}
      {field && !onConfirm && group.level === "error" && (
        <span className="flex items-center gap-1">
          <Input aria-label={`Value for ${group.ids.length} rows: ${group.label}`} placeholder={missing ? "Value for all" : "Replace all with"} className="!h-8 !w-32 !text-xs" value={value} onChange={(e) => onValue(e.target.value)} />
          <Button size="sm" variant="secondary" disabled={!value.trim()} onClick={() => onApply(value.trim())}>Apply</Button>
        </span>
      )}
      {optionalWarning && <Button size="sm" variant="secondary" onClick={() => onApply("")}>Leave empty</Button>}
      <Button size="sm" variant="ghost" onClick={onShow}>Edit individually</Button>
    </li>
  );
}
