"use client";

import { useState, useRef } from "react";
import { Upload, Download, CheckCircle2, XCircle, FileText } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";

export interface ProductFormValues {
  name: string;
  sku: string;
  category: string;
  brand: string;
  unit: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
}

const CATEGORIES = ["Accessories", "Cables", "Audio", "Chargers", "Storage", "Networking"];
const UNITS = ["Piece", "Box", "Kilogram", "Gram", "Litre", "Metre", "Pack"];

const CSV_HEADERS = ["name", "sku", "category", "brand", "unit", "cost", "price", "stock", "minStock"];

interface ProductFormDrawerProps {
  open: boolean;
  onClose: () => void;
  initial?: ProductFormValues | null;
  onSubmit: (values: ProductFormValues) => void;
  onBulkSubmit?: (values: ProductFormValues[]) => void;
}

function toForm(initial?: ProductFormValues | null) {
  return {
    name: initial?.name ?? "",
    sku: initial?.sku ?? "",
    category: initial?.category ?? "Accessories",
    brand: initial?.brand ?? "",
    unit: initial?.unit ?? "Piece",
    price: initial?.price != null ? String(initial.price) : "",
    cost: initial?.cost != null ? String(initial.cost) : "",
    stock: initial?.stock != null ? String(initial.stock) : "",
    minStock: initial?.minStock != null ? String(initial.minStock) : "",
  };
}

function isValid(f: Record<string, string>) {
  return f.name.trim() && f.sku.trim() && f.price.trim() && f.cost.trim() && f.stock.trim() && f.minStock.trim();
}

function parseForm(f: Record<string, string>): ProductFormValues {
  return {
    name: f.name.trim(),
    sku: f.sku.trim().toUpperCase(),
    category: f.category || "Accessories",
    brand: f.brand?.trim() ?? "",
    unit: f.unit || "Piece",
    price: Number(f.price),
    cost: Number(f.cost),
    stock: Number(f.stock),
    minStock: Number(f.minStock),
  };
}

// ── Single form ──────────────────────────────────────────────────────────────

function SingleForm({ initial, onClose, onSubmit }: { initial?: ProductFormValues | null; onClose: () => void; onSubmit: (v: ProductFormValues) => void }) {
  const [form, setForm] = useState(() => toForm(initial));
  const valid = Boolean(isValid(form));
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSubmit(parseForm(form));
    onClose();
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={initial ? "Edit Product" : "Add Product"}
      description={initial ? `Update ${initial.name}` : "Create a new product in your inventory"}
      size="md"
      footer={<form onSubmit={submit}><FormFooter submitLabel={initial ? "Save Changes" : "Add Product"} onCancel={onClose} disabled={!valid} /></form>}
    >
      <div className="p-5 space-y-4">
        <Field label="Product name" required>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Phone Case - iPhone" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU" required>
            <Input value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="e.g. PC-001" className="font-mono" />
          </Field>
          <Field label="Category">
            <Select value={form.category} onChange={(e) => set("category", e.target.value)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand">
            <Input value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder="e.g. Anker" />
          </Field>
          <Field label="Unit">
            <Select value={form.unit} onChange={(e) => set("unit", e.target.value)}>
              {UNITS.map((u) => <option key={u}>{u}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cost price" required>
            <Input type="number" min="0" value={form.cost} onChange={(e) => set("cost", e.target.value)} placeholder="0" className="font-mono" />
          </Field>
          <Field label="Selling price" required>
            <Input type="number" min="0" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="0" className="font-mono" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stock" required>
            <Input type="number" min="0" value={form.stock} onChange={(e) => set("stock", e.target.value)} placeholder="0" />
          </Field>
          <Field label="Min stock" required>
            <Input type="number" min="0" value={form.minStock} onChange={(e) => set("minStock", e.target.value)} placeholder="0" />
          </Field>
        </div>
      </div>
    </Drawer>
  );
}

// ── CSV bulk import ──────────────────────────────────────────────────────────

type ParsedRow = { data: Record<string, string>; valid: boolean; errors: string[] };

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    const errors: string[] = [];
    if (!row.name) errors.push("name required");
    if (!row.sku) errors.push("sku required");
    if (!row.price || isNaN(Number(row.price))) errors.push("invalid price");
    if (!row.cost || isNaN(Number(row.cost))) errors.push("invalid cost");
    if (row.stock === undefined || isNaN(Number(row.stock))) errors.push("invalid stock");
    if (row.minstock === undefined || isNaN(Number(row.minstock))) errors.push("invalid minStock");
    // normalise minstock → minStock
    if (row.minstock !== undefined) { row.minStock = row.minstock; }
    return { data: row, valid: errors.length === 0, errors };
  });
}

function downloadTemplate() {
  const sample = [
    CSV_HEADERS.join(","),
    "Phone Case - iPhone,PC-001,Accessories,Generic,Piece,2500,5000,45,10",
    "USB-C Cable 1m,UC-002,Cables,Anker,Piece,1200,3000,120,20",
  ].join("\n");
  const blob = new Blob([sample], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "products_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function BulkImport({ onClose, onBulkSubmit }: { onClose: () => void; onBulkSubmit: (v: ProductFormValues[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);

  const validRows = rows?.filter((r) => r.valid) ?? [];

  const handleFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setRows(parseCSV(e.target?.result as string));
    reader.readAsText(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith(".csv")) handleFile(file);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validRows.length) return;
    onBulkSubmit(validRows.map((r) => parseForm(r.data)));
    onClose();
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title="Import Products"
      description={rows ? `${validRows.length} valid · ${(rows.length - validRows.length)} errors` : "Upload a CSV file"}
      size="lg"
      footer={
        rows && (
          <form onSubmit={submit}>
            <FormFooter
              submitLabel={`Import ${validRows.length} Product${validRows.length !== 1 ? "s" : ""}`}
              onCancel={onClose}
              disabled={validRows.length === 0}
            />
          </form>
        )
      }
    >
      <div className="p-5 space-y-4">

        {/* Download template */}
        <button
          type="button"
          onClick={downloadTemplate}
          className="w-full flex items-center gap-3 px-4 py-3 border border-border rounded-lg hover:bg-surface transition-colors text-left"
        >
          <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center flex-shrink-0">
            <Download size={15} className="text-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Download CSV template</p>
            <p className="text-xs text-muted">Fill it in Excel or Google Sheets, then upload</p>
          </div>
        </button>

        {/* Drop zone */}
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
            accept=".csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <Upload size={24} className="mx-auto mb-2 text-muted" />
          {fileName ? (
            <p className="text-sm font-semibold text-foreground">{fileName}</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-foreground">Drop your CSV here or click to browse</p>
              <p className="text-xs text-muted mt-1">Only .csv files</p>
            </>
          )}
        </div>

        {/* Preview table */}
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
                    <th className="px-3 py-2 text-muted font-semibold">Name</th>
                    <th className="px-3 py-2 text-muted font-semibold">SKU</th>
                    <th className="px-3 py-2 text-muted font-semibold">Category</th>
                    <th className="px-3 py-2 text-muted font-semibold text-right">Cost</th>
                    <th className="px-3 py-2 text-muted font-semibold text-right">Price</th>
                    <th className="px-3 py-2 text-muted font-semibold text-right">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row, i) => (
                    <tr key={i} className={row.valid ? "bg-white" : "bg-red-50"}>
                      <td className="px-3 py-2">
                        {row.valid
                          ? <CheckCircle2 size={13} className="text-emerald-500" />
                          : <XCircle size={13} className="text-red-500" />}
                      </td>
                      <td className="px-3 py-2 font-medium text-foreground">{row.data.name || <span className="text-red-400">—</span>}</td>
                      <td className="px-3 py-2 font-mono text-muted">{row.data.sku || <span className="text-red-400">—</span>}</td>
                      <td className="px-3 py-2 text-muted">{row.data.category || "—"}</td>
                      <td className="px-3 py-2 text-right text-muted">{row.data.cost || "—"}</td>
                      <td className="px-3 py-2 text-right text-muted">{row.data.price || "—"}</td>
                      <td className="px-3 py-2 text-right text-muted">{row.data.stock || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.some((r) => !r.valid) && (
              <div className="px-4 py-2.5 bg-red-50 border-t border-red-100">
                <p className="text-xs text-red-600 font-medium">
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

// ── Public component ─────────────────────────────────────────────────────────

type Mode = "single" | "bulk";

export function ProductFormDrawer({ open, onClose, initial, onSubmit, onBulkSubmit }: ProductFormDrawerProps) {
  const [mode, setMode] = useState<Mode>("single");

  if (!open) return null;
  if (initial) return <SingleForm initial={initial} onClose={onClose} onSubmit={onSubmit} />;

  return (
    <>
      {mode === "single"
        ? <SingleForm onClose={onClose} onSubmit={onSubmit} initial={null} />
        : <BulkImport onClose={onClose} onBulkSubmit={onBulkSubmit ?? ((items) => items.forEach(onSubmit))} />
      }

      {/* Mode switcher */}
      <div className="fixed bottom-[72px] right-0 z-[60] w-full sm:w-96 px-5 pointer-events-none">
        <div className="pointer-events-auto flex gap-1 bg-surface border border-border rounded-lg p-1 shadow-sm">
          {(["single", "bulk"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 py-1.5 text-[12px] font-semibold rounded-md transition-colors ${
                mode === m ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
              }`}
            >
              {m === "single" ? "Single" : "Bulk Import"}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
