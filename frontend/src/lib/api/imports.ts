import { request } from "./client";
import type { SingleResponse } from "./types";
import type { ImportIssue } from "@/lib/importValues";

/** Which import a staged row belongs to; the server checks rows against this module's own records. */
export type ImportModule = "products" | "customers" | "suppliers" | "expenses" | "sales" | "accounts";

/** The server's view of one staged row: why it would duplicate an existing record, extra problems, and resolved ids (e.g. _category_id). */
export interface RowCheck { duplicate: string | null; issues: ImportIssue[]; context: Record<string, string> }

export interface ImportAi { available: boolean; photos: boolean; pdf: boolean; mapping: boolean; reason: string | null }

/** Rows read from a photo or PDF: values exactly as written, with the cells Pesaa AI was unsure of. */
export interface Extraction { headers: string[]; rows: string[][]; uncertain: [number, number][]; note: string }

export interface SheetPicture { preview: string | null; problem: string | null }

const form = (entries: Record<string, string | Blob>) => {
  const body = new FormData();
  for (const [key, value] of Object.entries(entries)) body.append(key, value);
  return body;
};

export const importsApi = {
  ai: () => request<SingleResponse<ImportAi>>("/imports/ai"),
  check: (module: ImportModule, rows: Record<string, string>[]) =>
    request<SingleResponse<RowCheck[]>>("/imports/check", { method: "POST", body: JSON.stringify({ module, rows }) }),
  sheetPictures: (file: File) =>
    request<SingleResponse<{ rows: Record<string, SheetPicture[]> }>>("/imports/sheet-pictures", { method: "POST", body: form({ file }) }, 120_000),
  extract: (module: ImportModule, fields: { key: string; label: string }[], file: File) =>
    request<SingleResponse<Extraction>>("/imports/extract", { method: "POST", body: form({ file, module, fields: JSON.stringify(fields) }) }, 150_000),
  suggestMapping: (module: ImportModule, fields: { key: string; label: string }[], columns: { header: string; samples: string[] }[]) =>
    request<SingleResponse<Record<string, string | null>>>("/imports/suggest-mapping", { method: "POST", body: JSON.stringify({ module, fields, columns }) }),
  /** Pictures pasted into an import sheet, attached to the products created from those rows ({sheet row: product id}). */
  attachSheetPictures: (file: File, rows: Record<number, string>) =>
    request<SingleResponse<{ total_pictures: number; extra_pictures: number; problems: { file: string; reason: string }[] }>>(
      "/tenants/inventory/products/attach-sheet-pictures", { method: "POST", body: form({ file, rows: JSON.stringify(rows) }) }, 180_000),
};
