"use client";

import { useState, useRef } from "react";
import { XCircle, ImagePlus, X } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import { CsvImportDrawer } from "@/components/ui/CsvImportDrawer";
import { useCategories, useBrands, useUnits } from "@/lib/api/hooks";
import { resolveUploadUrl } from "@/lib/api/client";

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
  image_url?: string | null;
}

const FALLBACK_CATEGORIES = ["Accessories", "Cables", "Audio", "Chargers", "Storage", "Networking"];
const FALLBACK_UNITS = ["Piece", "Box", "Kilogram", "Gram", "Litre", "Metre", "Pack"];

const CSV_HEADERS = ["name", "sku", "category", "brand", "unit", "cost", "price", "stock", "minStock"];

interface ProductFormDrawerProps {
  open: boolean;
  mode?: "single" | "bulk";
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(() => resolveUploadUrl(initial?.image_url));
  const imageInputRef = useRef<HTMLInputElement>(null);
  const valid = Boolean(isValid(form));
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { data: categoriesData } = useCategories();
  const { data: brandsData } = useBrands();
  const { data: unitsData } = useUnits();
  const categories = categoriesData?.items ?? [];
  const brands = brandsData?.items ?? [];
  const units = unitsData?.items ?? [];

  if (form.category_id === "" && categories.length > 0) {
    setForm((f) => (f.category_id ? f : { ...f, category: categories[0].name, category_id: categories[0].id }));
  }
  if (form.unit_id === "" && units.length > 0) {
    setForm((f) => (f.unit_id ? f : { ...f, unit: units[0].name, unit_id: units[0].id }));
  }

  const handleImageChange = (file: File) => {
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

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

// ── Bulk import (Excel or CSV) ────────────────────────────────────────────────

function parseProductRow(row: Record<string, string>): { data: ProductFormValues; errors: string[] } {
  const errors: string[] = [];
  if (!row.name) errors.push("name required");
  if (!row.sku) errors.push("sku required");
  if (!row.price || isNaN(Number(row.price))) errors.push("invalid price");
  if (!row.cost || isNaN(Number(row.cost))) errors.push("invalid cost");
  if (row.stock === undefined || isNaN(Number(row.stock))) errors.push("invalid stock");
  if (row.minstock === undefined || isNaN(Number(row.minstock))) errors.push("invalid minStock");
  // normalise minstock → minStock for parseForm()
  const normalised = row.minstock !== undefined ? { ...row, minStock: row.minstock } : row;
  return { data: parseForm(normalised), errors };
}

function BulkImport({ onClose, onBulkSubmit, color }: { onClose: () => void; onBulkSubmit: (v: ProductFormValues[]) => void; color?: string }) {
  return (
    <CsvImportDrawer<ProductFormValues>
      open
      onClose={onClose}
      onSubmit={async (items) => onBulkSubmit(items)}
      title="Import Products"
      itemNoun="product"
      templateFilename="products_template.xlsx"
      templateHeaders={CSV_HEADERS}
      templateSampleRows={[
        ["Phone Case - iPhone", "PC-001", "Accessories", "Generic", "Piece", "2500", "5000", "45", "10"],
        ["USB-C Cable 1m", "UC-002", "Cables", "Anker", "Piece", "1200", "3000", "120", "20"],
      ]}
      previewColumns={[
        { key: "name", label: "Name", required: true },
        { key: "sku", label: "SKU", required: true },
        { key: "category", label: "Category" },
        { key: "brand", label: "Brand" },
        { key: "unit", label: "Unit" },
        { key: "cost", label: "Cost", align: "right", required: true },
        { key: "price", label: "Price", align: "right", required: true },
        { key: "stock", label: "Stock", align: "right", required: true },
        { key: "minstock", label: "Min Stock", align: "right", required: true },
      ]}
      parseRow={parseProductRow}
      color={color}
    />
  );
}

// ── Public component ─────────────────────────────────────────────────────────

export function ProductFormDrawer({ open, mode = "single", onClose, initial, onSubmit, onBulkSubmit, color }: ProductFormDrawerProps) {
  if (!open) return null;
  if (mode === "bulk") return <BulkImport onClose={onClose} onBulkSubmit={onBulkSubmit ?? (() => {})} color={color} />;
  return <SingleForm initial={initial} onClose={onClose} onSubmit={onSubmit} color={color} />;
}
