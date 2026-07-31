"use client";

import { useState } from "react";
import { Mail, MapPin, Phone, Plus, Search, Truck } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, FormFooter } from "@/components/ui/Form";

type Supplier = {
  id: number;
  name: string;
  category: string;
  phone: string;
  email: string;
  location: string;
  orders: number;
  outstanding: number;
};

const INITIAL_SUPPLIERS: Supplier[] = [
  { id: 1, name: "Rwanda Supply Co", category: "Groceries", phone: "+250 788 100 200", email: "sales@rwandasupply.rw", location: "Kigali", orders: 18, outstanding: 0 },
  { id: 2, name: "Kigali Wholesalers", category: "Beverages", phone: "+250 722 345 678", email: "orders@kigaliwholesale.rw", location: "Gikondo", orders: 12, outstanding: 1240000 },
  { id: 3, name: "East Africa Distributors", category: "Electronics", phone: "+250 733 999 111", email: "info@eafdistributors.com", location: "Kigali", orders: 7, outstanding: 890000 },
  { id: 4, name: "Nyabugogo Traders", category: "General", phone: "+250 788 555 444", email: "traders@nyabugogo.rw", location: "Nyabugogo", orders: 25, outstanding: 0 },
  { id: 5, name: "Musanze Fresh Foods", category: "Produce", phone: "+250 784 222 333", email: "fresh@musanzefoods.rw", location: "Musanze", orders: 9, outstanding: 450000 },
];

export default function SuppliersPage() {
  const { currencySymbol } = useAppConfig();
  const [suppliers, setSuppliers] = useState<Supplier[]>(INITIAL_SUPPLIERS);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", category: "", phone: "", location: "" });

  const fmt = (v: number) => `${currencySymbol} ${v.toLocaleString()}`;

  const filtered = suppliers.filter((s) => {
    const q = search.trim().toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q) || s.location.toLowerCase().includes(q);
  });

  const totalOutstanding = suppliers.reduce((s, x) => s + x.outstanding, 0);
  const totalOrders = suppliers.reduce((s, x) => s + x.orders, 0);

  const addSupplier = () => {
    if (!form.name.trim()) return;
    setSuppliers((prev) => [
      {
        id: prev.length + 1,
        name: form.name.trim(),
        category: form.category.trim() || "General",
        phone: form.phone.trim() || "—",
        email: "",
        location: form.location.trim() || "—",
        orders: 0,
        outstanding: 0,
      },
      ...prev,
    ]);
    setForm({ name: "", category: "", phone: "", location: "" });
    setShowModal(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Suppliers</h1>
          <p className="text-sm text-muted mt-1">Everyone you purchase from, in one place.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          <Plus size={16} /> Add Supplier
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { label: "Suppliers", value: suppliers.length, color: "#4f46e5" },
          { label: "Total orders", value: totalOrders, color: "#0284c7" },
          { label: "Outstanding balance", value: fmt(totalOutstanding), color: "#b45309" },
        ].map((s) => (
          <div key={s.label} className="bg-card border-y border-border p-4 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: s.color }} />
            <p className="text-xl font-extrabold text-foreground">{s.value}</p>
            <p className="text-[11px] text-muted mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 bg-card border border-border px-3 py-2 w-56">
        <Search size={14} className="text-muted flex-shrink-0" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search suppliers..."
          className="flex-1 text-[13px] outline-none bg-transparent text-foreground placeholder:text-muted"
        />
      </div>

      <div className="bg-card border border-border overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="p-4 font-medium">Supplier</th>
              <th className="p-4 font-medium">Category</th>
              <th className="p-4 font-medium">Contact</th>
              <th className="p-4 font-medium">Location</th>
              <th className="p-4 font-medium text-right">Orders</th>
              <th className="p-4 font-medium text-right">Outstanding</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-surface/50">
                <td className="p-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 flex items-center justify-center bg-accent/10 flex-shrink-0">
                      <Truck size={15} className="text-accent" />
                    </div>
                    <span className="text-[13px] font-semibold text-foreground">{s.name}</span>
                  </div>
                </td>
                <td className="p-4 text-[13px] text-muted">{s.category}</td>
                <td className="p-4">
                  <div className="space-y-0.5">
                    <p className="flex items-center gap-1.5 text-[12px] text-foreground/80"><Phone size={11} className="text-muted" />{s.phone}</p>
                    {s.email && <p className="flex items-center gap-1.5 text-[12px] text-muted"><Mail size={11} />{s.email}</p>}
                  </div>
                </td>
                <td className="p-4 text-[13px] text-muted">
                  <span className="flex items-center gap-1.5"><MapPin size={12} className="text-muted" />{s.location}</span>
                </td>
                <td className="p-4 text-right text-[13px] font-semibold text-foreground">{s.orders}</td>
                <td className={`p-4 text-right text-[13px] font-bold tabular-nums ${s.outstanding > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                  {fmt(s.outstanding)}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="p-10 text-center text-sm text-muted">No suppliers match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Drawer
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Add Supplier"
        description="Create a supplier account to start ordering."
        side="right"
        footer={
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addSupplier();
            }}
          >
            <FormFooter submitLabel="Add supplier" onCancel={() => setShowModal(false)} disabled={!form.name.trim()} />
          </form>
        }
      >
        <div className="p-5 space-y-4">
          <Field label="Supplier name" required>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Rwanda Supply Co"
              autoFocus
            />
          </Field>
          <Field label="Category">
            <Input
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="e.g. Groceries"
            />
          </Field>
          <Field label="Phone">
            <Input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+250 7xx xxx xxx"
            />
          </Field>
          <Field label="Location">
            <Input
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="e.g. Kigali"
            />
          </Field>
        </div>
      </Drawer>
    </div>
  );
}
