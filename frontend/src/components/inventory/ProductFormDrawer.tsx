"use client";

import { useState } from "react";
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

interface ProductFormDrawerProps {
  open: boolean;
  onClose: () => void;
  initial?: ProductFormValues | null;
  onSubmit: (values: ProductFormValues) => void;
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

export function ProductFormDrawer({ open, onClose, initial = null, onSubmit }: ProductFormDrawerProps) {
  const [form, setForm] = useState(() => toForm(initial));

  const valid =
    Boolean(form.name.trim()) &&
    Boolean(form.sku.trim()) &&
    form.price.trim() !== "" &&
    form.cost.trim() !== "" &&
    form.stock.trim() !== "" &&
    form.minStock.trim() !== "";

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!valid) return;
    onSubmit({
      name: form.name.trim(),
      sku: form.sku.trim().toUpperCase(),
      category: form.category,
      brand: form.brand.trim(),
      unit: form.unit,
      price: Number(form.price),
      cost: Number(form.cost),
      stock: Number(form.stock),
      minStock: Number(form.minStock),
    });
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={initial ? "Edit Product" : "Add Product"}
      description={initial ? `Update ${initial.name}` : "Create a new product in your inventory"}
      size="md"
      footer={
        <form onSubmit={submit}>
          <FormFooter submitLabel={initial ? "Save Changes" : "Add Product"} onCancel={onClose} disabled={!valid} />
        </form>
      }
    >
      <div className="p-5 space-y-4">
        <Field label="Product name" required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Phone Case - iPhone" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU" required>
            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="e.g. PC-001" className="font-mono" />
          </Field>
          <Field label="Category">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand">
            <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="e.g. Anker" />
          </Field>
          <Field label="Unit">
            <Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              {UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cost price" required>
            <Input type="number" min="0" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="0" className="font-mono" />
          </Field>
          <Field label="Selling price" required>
            <Input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0" className="font-mono" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stock" required>
            <Input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="0" />
          </Field>
          <Field label="Min stock" required>
            <Input type="number" min="0" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} placeholder="0" />
          </Field>
        </div>
      </div>
    </Drawer>
  );
}
