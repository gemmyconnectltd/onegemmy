"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, Download, CheckCircle2, XCircle, FileText, ImagePlus, X } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import { inventoryApi, type ApiCategory, type ApiBrand, type ApiUnit } from "@/lib/api";

export interface ProductFormValues {
  name: string;
  sku: string;
  category: string;      // name (display)
  category_id: string;   // uuid
  brand: string;
  brand_id: string;
  unit: string;
  unit_id: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
}

const FALLBACK_CATEGORIES = ["Accessories", "Cables", "Audio", "Chargers", "Storage", "Networking"];
const FALLBACK_UNITS = ["Piece", "Box", "Kilogram", "Gram", "Litre", "Metre", "Pack"];

const CSV_HEADERS = ["name", "sku", "category", "brand", "unit", "cost", "price", "stock", "minStock"];

interface ProductFormDrawerProps {
  open: boolean;
  onClose: () => void;
  initial?: ProductFormValues | null;
  onSubmit: (values: ProductFormValues, imageFile?: File) => Promise<void>;
  onBulkSubmit?: (values: ProductFormValues[]) => void;
  color?: string;
}

function toForm(initial?: ProductFormValues | null) {
  return {
    name: initial?.name ?? "",
    sku: initial?.sku ?? "",
    category: initial?.category ?? "",
    category_id: initial?.category_id ?? "",
    brand: initial?.brand ?? "",
    brand_id: initial?.brand_id ?? "",
    unit: initial?.unit ?? "",
    unit_id: initial?.unit_id ?? "",
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
    category: f.category || "",
    category_id: f.category_id || "",
    brand: f.brand?.trim() ?? "",
    brand_id: f.brand_id || "",
    unit: f.unit || "",
    unit_id: f.unit_id || "",
    price: Number(f.price),
    cost: Number(f.cost),
    stock: Number(f.stock),
    minStock: Number(f.minStock),
  };
}

// ── Single form ──────────────────────────────────────────────────────────────

function SingleForm({ initial, onClose, onSubmit, color }: { initial?: ProductFormValues | null; onClose: () => void; onSubmit: (v: ProductFormValues, imageFile?: File) => Promise<void>; color?: string }) {
  const [form, setForm] = useState(() => toForm(initial));
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [brands, setBrands] = useState<ApiBrand[]>([]);
  const [units, setUnits] = useState<ApiUnit[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const valid = Boolean(isValid(form));
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleImageChange = (file: File) => {
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  useEffect(() => {
    inventoryApi.listCategories().then((r) => {
      setCategories(r.data.items);
      if (!form.category_id && r.data.items.length > 0)
        setForm((f) => ({ ...f, category: r.data.items[0].name, category_id: r.data.items[0].id }));
    }).catch(() => {});
    inventoryApi.listBrands().then((r) => setBrands(r.data.items)).catch(() => {});
    inventoryApi.listUnits().then((r) => {
      setUnits(r.data.items);
      if (!form.unit_id && r.data.items.length > 0)
        setForm((f) => ({ ...f, unit: r.data.items[0].name, unit_id: r.data.items[0].id }));
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(parseForm(form), imageFile ?? undefined);
      onClose();
    } catch (err: unknown) {
      console.error("ProductFormDrawer error:", err);
      if (err instanceof TypeError) {
        setError("Cannot reach the server. Check your connection.");
      } else {
        const detail = (err as { detail?: string })?.detail;
        setError(detail || "Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const categoryOptions = categories.length > 0 ? categories : FALLBACK_CATEGORIES.map((n, i) => ({ id: `__fb_cat_${i}`, name: n }));
  const unitOptions = units.length > 0 ? units : FALLBACK_UNITS.map((n, i) => ({ id: `__fb_unit_${i}`, name: n }));

  return (
    <Drawer
      open
      onClose={onClose}
      title={initial ? "Edit Product" : "Add Product"}
      description={initial ? `Update ${initial.name}` : "Create a new product in your inventory"}
      size="md"
      footer={<form onSubmit={submit}><FormFooter submitLabel={submitting ? "Saving…" : initial ? "Save Changes" : "Add Product"} onCancel={onClose} disabled={!valid || submitting} color={color} /></form>}
    >
      <div className="p-5 space-y-4">
        {error && (
          <div className="flex items-start gap-2.5 px-3.5 py-3 bg-red-50 border border-red-200 rounded-lg">
            <XCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </div>
        )}
        {/* Image picker */}
        <div
          onClick={() => imageInputRef.current?.click()}
          className="relative w-full h-36 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-foreground/30 hover:bg-surface/40 transition-colors overflow-hidden"
        >
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageChange(f); }}
          />
          {imagePreview ? (
            <>
              <img src={imagePreview} alt="preview" className="absolute inset-0 w-full h-full object-cover" />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setImageFile(null); setImagePreview(null); }}
                className="absolute top-2 right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
              >
                <X size={12} className="text-white" />
              </button>
            </>
          ) : (
            <>
              <ImagePlus size={22} className="text-muted mb-1.5" />
              <p className="text-xs text-muted">Click to upload product image</p>
              <p className="text-[10px] text-muted/50 mt-0.5">JPEG, PNG or WebP · max 5MB</p>
            </>
          )}
        </div>

        <Field label="Product name" required>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Phone Case - iPhone" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU" required>
            <Input value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="e.g. PC-001" className="font-mono" />
          </Field>
          <Field label="Category">
            <Select
              value={form.category_id}
              onChange={(e) => {
                const opt = categoryOptions.find((c) => c.id === e.target.value);
                setForm((f) => ({ ...f, category_id: e.target.value, category: opt?.name ?? e.target.value }));
              }}
            >
              {categoryOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand">
            <Select
              value={form.brand_id}
              onChange={(e) => {
                const opt = brands.find((b) => b.id === e.target.value);
                setForm((f) => ({ ...f, brand_id: e.target.value, brand: opt?.name ?? "" }));
              }}
            >
              <option value="">— None —</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Unit">
            <Select
              value={form.unit_id}
              onChange={(e) => {
                const opt = unitOptions.find((u) => u.id === e.target.value);
                setForm((f) => ({ ...f, unit_id: e.target.value, unit: opt?.name ?? e.target.value }));
              }}
            >
              {unitOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
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

function BulkImport({ onClose, onBulkSubmit, color }: { onClose: () => void; onBulkSubmit: (v: ProductFormValues[]) => void; color?: string }) {
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
              color={color}
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
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color ? `${color}15` : "var(--accent-10)" }}>
            <Download size={15} style={{ color: color ?? "var(--accent)" }} />
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

export function ProductFormDrawer({ open, onClose, initial, onSubmit, onBulkSubmit, color }: ProductFormDrawerProps) {
  if (!open) return null;
  if (initial) return <SingleForm initial={initial} onClose={onClose} onSubmit={onSubmit} color={color} />;
  if (onBulkSubmit) return <BulkImport onClose={onClose} onBulkSubmit={onBulkSubmit} color={color} />;
  return <SingleForm onClose={onClose} onSubmit={onSubmit} initial={null} color={color} />;
}
