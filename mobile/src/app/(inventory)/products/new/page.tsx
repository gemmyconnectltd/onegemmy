"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, PackagePlus } from "lucide-react";

import { useCategories, useSuppliers, useCreateProduct } from "@/lib/api/hooks";

export default function MobileAddProductPage() {
  const router = useRouter();
  const categoriesQ = useCategories();
  const suppliersQ = useSuppliers();
  const createProduct = useCreateProduct();

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [stock, setStock] = useState("");
  const [minStock, setMinStock] = useState("0");
  const [categoryId, setCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const categories = categoriesQ.data?.items ?? [];
  const suppliers = suppliersQ.data?.items ?? [];

  const canSubmit = name.trim().length > 0 && price !== "" && Number(price) >= 0 && !createProduct.isPending;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    try {
      await createProduct.mutateAsync({
        name: name.trim(),
        sku: sku.trim() || null,
        price: Number(price),
        cost: cost === "" ? 0 : Number(cost),
        stock: stock === "" ? 0 : Number(stock),
        min_stock: Number(minStock) || 0,
        category_id: categoryId || null,
        supplier_id: supplierId || null,
      });
      setDone(true);
    } catch (e) {
      setError((e as { detail?: string })?.detail ?? "Failed to add product");
    }
  };

  if (done) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center px-8 text-center">
        <CheckCircle2 size={40} className="text-green-500 mb-3" />
        <p className="text-[15px] font-bold text-foreground">Product added</p>
        <p className="text-[12px] text-muted mt-1">{name.trim()} is now in your inventory</p>
        <button
          onClick={() => router.push("/inventory")}
          className="mt-6 w-full py-3 rounded-2xl bg-accent text-white text-[13px] font-semibold"
        >
          View inventory
        </button>
        <button
          onClick={() => {
            setName("");
            setSku("");
            setPrice("");
            setCost("");
            setStock("");
            setMinStock("0");
            setCategoryId("");
            setSupplierId("");
            setDone(false);
          }}
          className="mt-2 w-full py-3 rounded-2xl border border-border text-[13px] font-semibold text-foreground"
        >
          Add another
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col pb-6">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center text-muted" aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-[15px] font-bold text-foreground">Add Product</h1>
            <p className="text-[11px] text-muted mt-0.5">New item in your inventory</p>
          </div>
        </div>
      </header>

      <div className="flex-1 px-4 pt-4 space-y-3">
        <Field label="Product name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Rice 5kg"
            className={inputCls}
          />
        </Field>
        <Field label="SKU (optional)">
          <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. RICE-5KG" className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Selling price (RWF)">
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" placeholder="0" className={inputCls} />
          </Field>
          <Field label="Cost price (RWF)">
            <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="numeric" placeholder="0" className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Opening stock">
            <input value={stock} onChange={(e) => setStock(e.target.value)} inputMode="numeric" placeholder="0" className={inputCls} />
          </Field>
          <Field label="Low stock alert">
            <input value={minStock} onChange={(e) => setMinStock(e.target.value)} inputMode="numeric" placeholder="0" className={inputCls} />
          </Field>
        </div>
        <Field label="Category">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Supplier">
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputCls}>
            <option value="">No supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>

        {error && <p className="text-[12px] text-red-500 font-medium">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-accent text-white text-[13px] font-semibold disabled:opacity-40 active:scale-[0.98] transition mt-2"
        >
          <PackagePlus size={16} /> Add product
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted outline-none focus:border-accent";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-muted font-semibold block mb-1">{label}</label>
      {children}
    </div>
  );
}
