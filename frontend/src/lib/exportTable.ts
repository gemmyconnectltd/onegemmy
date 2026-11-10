import * as XLSX from "xlsx";

export type ExportCell = string | number | boolean | null | undefined;
/** What a page hands to Export: the same column names its Import template uses, so a downloaded file can be imported straight back. */
export interface ExportTable { filename: string; headers: string[]; rows: ExportCell[][] }

const stamp = () => new Date().toISOString().slice(0, 10);

/** Writes one Excel sheet. Text always goes in as text cells, so values like "=SUM(A1)" are never evaluated when the file is opened. */
export function downloadTable({ filename, headers, rows }: ExportTable) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows.map((r) => r.map((c) => c ?? ""))]);
  sheet["!cols"] = headers.map((h, i) => ({ wch: Math.min(40, Math.max(h.length, ...rows.slice(0, 200).map((r) => String(r[i] ?? "").length)) + 2) }));
  // Column filters on the header row; the layout stays import-compatible (header in row 1, no extra rows).
  if (headers.length) sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: headers.length - 1 } }) };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Export");
  XLSX.writeFile(book, `${filename}-${stamp()}.xlsx`);
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
