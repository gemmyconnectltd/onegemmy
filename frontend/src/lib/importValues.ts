// Reading values typed into an import spreadsheet. Plain functions (no imports) so they can be tested on their own.

/** One problem with an imported row. `column` is the preview column key it belongs to, so that cell can be highlighted;
 *  `summary` groups the same problem across rows ("invalid Cost"). */
export interface ImportIssue { column?: string; message: string; summary?: string }

const CURRENCY = /^(?:rwf|frw|rf|usd|us\$|kes|ksh|ugx|tzs|eur|gbp|\$|€|£)\.?\s*|\s*(?:rwf|frw|rf|usd|kes|ksh|ugx|tzs|eur|gbp|\$|€|£)\.?$/i;

/** An amount or quantity as people type it in Excel: "2,500", "2 500", "RWF 5,000", "5,000 Frw", "12.5".
 *  Commas and spaces count only as thousands separators, so "2,5" (a decimal comma) and "2,500abc" are refused, never guessed. */
export function parseAmount(input: unknown): { ok: true; value: number } | { ok: false; reason: "empty" | "not-a-number" } {
  if (typeof input === "number") return Number.isFinite(input) ? { ok: true, value: input } : { ok: false, reason: "not-a-number" };
  let text = String(input ?? "").replace(/[   ]/g, " ").trim();
  if (!text) return { ok: false, reason: "empty" };
  for (let i = 0; i < 2; i++) text = text.replace(CURRENCY, "").trim();
  text = text.replace(/\s+/g, "");
  if (text.includes(",")) {
    if (!/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) return { ok: false, reason: "not-a-number" };
    text = text.replace(/,/g, "");
  }
  if (!/^-?(\d+(\.\d+)?|\.\d+)$/.test(text)) return { ok: false, reason: "not-a-number" };
  return { ok: true, value: Number(text) };
}

/** A real calendar date written YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

const quote = (value: string) => `'${value.length > 40 ? `${value.slice(0, 40)}…` : value}'`;

/** A required amount that must not be negative. Returns the number, or the issue to show. */
export function checkAmount(raw: string | undefined, column: string, label: string): { value: number } | { issue: ImportIssue } {
  const text = String(raw ?? "").trim();
  const parsed = parseAmount(text);
  if (!parsed.ok && parsed.reason === "empty") return { issue: { column, message: `${label} is required`, summary: `missing ${label}` } };
  if (!parsed.ok) return { issue: { column, message: `${label}: ${quote(text)} is not a number`, summary: `invalid ${label}` } };
  if (parsed.value < 0) return { issue: { column, message: `${label} can't be negative (${quote(text)})`, summary: `negative ${label}` } };
  return { value: parsed.value };
}

/** One product row from the import sheet (headers already lowercased without spaces): its numbers, and every problem found. */
export function checkProductRow(row: Record<string, string>): { price: number; cost: number; stock: number; minStock: number; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  if (!String(row.name ?? "").trim()) issues.push({ column: "name", message: "Name is required", summary: "missing Name" });
  const amount = (key: string, label: string) => {
    const result = checkAmount(row[key], key, label);
    if ("issue" in result) { issues.push(result.issue); return 0; }
    return result.value;
  };
  const cost = amount("cost", "Cost");
  const price = amount("price", "Price");
  const stock = amount("stock", "Stock");
  const minStock = amount("minstock", "Min Stock");
  for (const [key, label] of [["expirydate", "Expiry"], ["manufactureddate", "Manufactured"]] as const) {
    const value = String(row[key] ?? "").trim();
    if (value && !isIsoDate(value)) issues.push({ column: key, message: `${label} must be YYYY-MM-DD (got ${quote(value)})`, summary: `invalid ${label} date` });
  }
  const link = String(row.imageurl ?? "").trim();
  if (link && !/^https:\/\//i.test(link)) issues.push({ column: "imageurl", message: `Picture link must start with https:// (got ${quote(link)})`, summary: "invalid Picture link" });
  return { price, cost, stock, minStock, issues };
}

/** The most common problems across rows, most frequent first: [{ label: "invalid Cost", rows: 4 }]. A row counts once per problem. */
export function summarizeIssues(rows: ImportIssue[][], limit = 3): { label: string; rows: number }[] {
  const counts = new Map<string, number>();
  for (const issues of rows) for (const label of new Set(issues.map((i) => i.summary ?? i.message))) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts.entries()].map(([label, n]) => ({ label, rows: n })).sort((a, b) => b.rows - a.rows || a.label.localeCompare(b.label)).slice(0, limit);
}

/** CSV text into rows of cells. Handles quoted cells, so "2,500" in quotes stays one cell, plus doubled quotes and Windows line ends. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
