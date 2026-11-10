import * as XLSX from "xlsx";

export type ExportCell = string | number | boolean | null | undefined;
/** What a page hands to Export: the same column names its Import template uses, so a downloaded file can be imported straight back. */
export interface ExportTable { filename: string; headers: string[]; rows: ExportCell[][] }

const pad = (n: number) => String(n).padStart(2, "0");
/** Local date and time of the export, so two downloads of the same list never share a name. */
const stamp = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}`; };
const clean = (text: string) => text.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
/** "sales-returns" -> "Sales Returns". */
const titleOf = (slug: string) => slug.split(/[-_\s]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/** Writes one Excel sheet. Text always goes in as text cells, so values like "=SUM(A1)" are never evaluated when the file is opened.
 *  The file is named "<Business> - <List> - <date time>.xlsx" so a business can tell its exports apart. */
export function downloadTable({ filename, headers, rows }: ExportTable, business?: string | null) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows.map((r) => r.map((c) => c ?? ""))]);
  sheet["!cols"] = headers.map((h, i) => ({ wch: Math.min(40, Math.max(h.length, ...rows.slice(0, 200).map((r) => String(r[i] ?? "").length)) + 2) }));
  // Column filters on the header row; the layout stays import-compatible (header in row 1, no extra rows).
  if (headers.length) sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: headers.length - 1 } }) };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, titleOf(filename).slice(0, 31) || "Export");
  XLSX.writeFile(book, `${[business ? clean(business) : "", titleOf(filename), stamp()].filter(Boolean).join(" - ")}.xlsx`);
}

/** Every record matching the page's filters, not just the page on screen. */
export async function fetchEvery<T>(fetchPage: (page: number, size: number) => Promise<{ data: { items: T[]; total: number } }>, size = 100, cap = 20000): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; all.length < cap; page++) {
    const { data } = await fetchPage(page, size);
    all.push(...data.items);
    if (all.length >= data.total || data.items.length === 0) break;
  }
  return all;
}
