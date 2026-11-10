"use client";

import { useState, useRef } from "react";
import { XCircle, ImagePlus, X } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import { CsvImportDrawer } from "@/components/ui/CsvImportDrawer";
import { useCategories, useBrands, useUnits, useProductVatSummary } from "@/lib/api/hooks";
import { PRODUCT_VAT_OPTIONS, type ProductVatTreatment } from "@/lib/api/inventory";
import { resolveUploadUrl } from "@/lib/api/client";

export interface ProductFormValues {
  name: string;
  sku: string;
  barcode?: string;
  subcategory?: string;
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
  /** "" = not reviewed yet. */
  vatTreatment?: ProductVatTreatment | "";
  taxCode?: string;
  vatReason?: string;
}

const FALLBACK_CATEGORIES = ["Accessories", "Cables", "Audio", "Chargers", "Storage", "Networking"];
const FALLBACK_UNITS = ["Piece", "Box", "Kilogram", "Gram", "Litre", "Metre", "Pack"];

export const CSV_HEADERS = ["name", "sku", "category", "brand", "unit", "cost", "price", "stock", "minStock", "batchNumber", "expiryDate", "manufacturedDate", "barcode", "subcategory", "imageUrl"];

/** A bulk-import row is a product plus optional batch/lot info — pharmacy,
 *  cosmetics, and anyone else tracking expiry can carry it in the same
 *  spreadsheet instead of adding batches one at a time afterward. */
export interface ProductBulkRow extends ProductFormValues {
  batchNumber: string;
  expiryDate: string;
  manufacturedDate: string;
  /** A picture link (https://...) from the spreadsheet. Pictures can also be added in bulk from a ZIP named after the SKUs. */
  imageUrl: string;
}

interface ProductFormDrawerProps {
  open: boolean;
  mode?: "single" | "bulk";
  onClose: () => void;
  initial?: ProductFormValues | null;
  onSubmit: (values: ProductFormValues, imageFile?: File) => Promise<void>;
  onBulkSubmit?: (values: ProductBulkRow[], file?: File) => void | Promise<void>;
  color?: string;
}

function toForm(initial?: ProductFormValues | null) {
  return {
    name: initial?.name ?? "",
    sku: initial?.sku ?? "",
    barcode: initial?.barcode ?? "",
    subcategory: initial?.subcategory ?? "",
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
    vatTreatment: initial?.vatTreatment ?? "",
    taxCode: initial?.taxCode ?? "",
    vatReason: initial?.vatReason ?? "",
  };
}

function isValid(f: Record<string, string>) {
  // Zero-rated, exempt and out-of-scope products need the reason (legal basis), as the server requires.
  const vatOk = !f.vatTreatment || f.vatTreatment === "standard" || !!f.vatReason?.trim();
  return f.name.trim() && f.price.trim() && f.cost.trim() && f.stock.trim() && f.minStock.trim() && vatOk;
}

function parseForm(f: Record<string, string>): ProductFormValues {
  return {
    name: f.name.trim(),
    sku: f.sku?.trim().toUpperCase() ?? "",
    barcode: f.barcode?.trim() ?? "",
    subcategory: f.subcategory?.trim() ?? "",
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
    vatTreatment: (f.vatTreatment || "") as ProductVatTreatment | "",
    taxCode: f.taxCode?.trim() ?? "",
    vatReason: f.vatReason?.trim() ?? "",
  };
}

// ── Single form ──────────────────────────────────────────────────────────────

function SingleForm({ initial, onClose, onSubmit, color }: { initial?: ProductFormValues | null; onClose: () => void; onSubmit: (v: ProductFormValues, imageFile?: File) => Promise<void>; color?: string }) {
  const vatSummary = useProductVatSummary();
  const canClassify = vatSummary.data?.can_classify ?? false;
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
              <p className="text-xs text-muted/50 mt-0.5">JPEG, PNG or WebP · max 5MB</p>
            </>
          )}
        </div>

        <Field label="Product name" required>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Phone Case - iPhone" autoFocus />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="SKU (optional)">
            <Input value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="Leave blank to generate" maxLength={100} className="font-mono" />
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Subcategory (optional)">
            <Input value={form.subcategory} onChange={(e) => set("subcategory", e.target.value)} placeholder="e.g. Phone cases" maxLength={255} />
          </Field>
          <Field label="Barcode (optional)">
            <Input value={form.barcode} onChange={(e) => set("barcode", e.target.value)} placeholder="Enter or scan barcode" maxLength={100} className="font-mono" />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Purchase price" required>
            <Input type="number" min="0" value={form.cost} onChange={(e) => set("cost", e.target.value)} placeholder="0" className="font-mono" />
          </Field>
          <Field label="Selling price" required>
            <Input type="number" min="0" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="0" className="font-mono" />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Stock" required>
            <Input type="number" min="0" value={form.stock} onChange={(e) => set("stock", e.target.value)} placeholder="0" />
          </Field>
          <Field label="Min stock" required>
            <Input type="number" min="0" value={form.minStock} onChange={(e) => set("minStock", e.target.value)} placeholder="0" />
          </Field>
        </div>

        {/* Tax & VAT: classified by someone allowed to make tax decisions; everyone else sees it read-only. */}
        <fieldset className="space-y-3 border-t border-border pt-4" disabled={!canClassify}>
          <legend className="text-sm font-semibold text-foreground">Tax &amp; VAT</legend>
          <Field label="Sales VAT treatment" hint={!canClassify ? "Changing VAT treatment needs the tax permission." : PRODUCT_VAT_OPTIONS.find((o) => o.value === form.vatTreatment)?.hint ?? "Not reviewed yet: sold at the standard rate until someone classifies it."}>
            <Select value={form.vatTreatment} onChange={(e) => set("vatTreatment", e.target.value)} aria-label="Sales VAT treatment">
              {!form.vatTreatment && <option value="">Not reviewed (standard rate applies)</option>}
              {PRODUCT_VAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Tax code (optional)">
              <Input value={form.taxCode} onChange={(e) => set("taxCode", e.target.value)} maxLength={30} placeholder="e.g. your EBM tax code" />
            </Field>
            <Field label={`Reason${form.vatTreatment && form.vatTreatment !== "standard" ? "" : " (optional)"}`} required={!!form.vatTreatment && form.vatTreatment !== "standard"}>
              <Input value={form.vatReason} onChange={(e) => set("vatReason", e.target.value)} maxLength={255} placeholder="Legal basis for this treatment" />
            </Field>
          </div>
        </fieldset>
      </div>
    </Drawer>
  );
}

// ── Bulk import (Excel or CSV) ────────────────────────────────────────────────

function parseProductRow(row: Record<string, string>): { data: ProductBulkRow; errors: string[] } {
  const errors: string[] = [];
  if (!row.name) errors.push("name required");
  if (!row.price || isNaN(Number(row.price))) errors.push("invalid price");
  if (!row.cost || isNaN(Number(row.cost))) errors.push("invalid cost");
  if (row.stock === undefined || isNaN(Number(row.stock))) errors.push("invalid stock");
  if (row.minstock === undefined || isNaN(Number(row.minstock))) errors.push("invalid minStock");
  if (row.expirydate && isNaN(new Date(row.expirydate).getTime())) errors.push("invalid expiryDate");
  if (row.manufactureddate && isNaN(new Date(row.manufactureddate).getTime())) errors.push("invalid manufacturedDate");
  if (row.imageurl?.trim() && !/^https:\/\//i.test(row.imageurl.trim())) errors.push("picture link must start with https://");
  // normalise minstock → minStock for parseForm()
  const normalised = row.minstock !== undefined ? { ...row, minStock: row.minstock } : row;
  return {
    data: {
      ...parseForm(normalised),
      batchNumber: row.batchnumber?.trim() ?? "",
      expiryDate: row.expirydate?.trim() ?? "",
      manufacturedDate: row.manufactureddate?.trim() ?? "",
      imageUrl: row.imageurl?.trim() ?? "",
    },
    errors,
  };
}

function BulkImport({ onClose, onBulkSubmit, color }: { onClose: () => void; onBulkSubmit: (v: ProductBulkRow[], file?: File) => void | Promise<void>; color?: string }) {
  return (
    <CsvImportDrawer<ProductBulkRow>
      open
      onClose={onClose}
      onSubmit={async (items, file) => onBulkSubmit(items, file)}
      title="Import Products"
      itemNoun="product"
      templateFilename="products_template.xlsx"
      templateHeaders={CSV_HEADERS}
      templateSampleRows={[
        ["Phone Case - iPhone", "PC-001", "Accessories", "Generic", "Piece", "2500", "5000", "45", "10", "", "", "", "", "", "https://example.com/pictures/pc-001.jpg"],
        ["Amoxicillin 500mg", "AMX-500", "Antibiotics", "GSK", "Box", "8000", "12000", "60", "10", "LOT-2026-04", "2026-04-01", "2025-10-01", "", "", ""],
      ]}
      previewColumns={[
        { key: "name", label: "Name", required: true },
        { key: "sku", label: "SKU" },
        { key: "category", label: "Category" },
        { key: "subcategory", label: "Subcategory" },
        { key: "barcode", label: "Barcode" },
        { key: "brand", label: "Brand" },
        { key: "unit", label: "Unit" },
        { key: "cost", label: "Cost", align: "right", required: true },
        { key: "price", label: "Price", align: "right", required: true },
        { key: "stock", label: "Stock", align: "right", required: true },
        { key: "minstock", label: "Min Stock", align: "right", required: true },
        { key: "batchnumber", label: "Batch #" },
        { key: "expirydate", label: "Expiry" },
        { key: "manufactureddate", label: "Manufactured" },
        { key: "imageurl", label: "Picture link" },
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
