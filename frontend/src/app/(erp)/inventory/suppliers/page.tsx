"use client";

import { useState } from "react";
import { Truck, Plus, Search, Edit2, Trash2, Phone, Mail, MapPin, Package } from "lucide-react";

const initialSuppliers = [
  { id: "1", name: "TechHub Rwanda",    contact: "Jean Bosco",   phone: "+250 788 123 456", email: "info@techhub.rw",    location: "Kigali, Rwanda",    products: 5, status: "active",   balance: 250000 },
  { id: "2", name: "Shenzhen Imports",  contact: "Li Wei",       phone: "+86 755 1234 5678",email: "sales@shenzhen.cn",  location: "Shenzhen, China",   products: 3, status: "active",   balance: 0      },
  { id: "3", name: "Anker Distributor", contact: "Alice Mutoni", phone: "+250 722 987 654", email: "alice@ankerdist.com",location: "Nairobi, Kenya",    products: 2, status: "active",   balance: 80000  },
  { id: "4", name: "JBL East Africa",   contact: "David Osei",   phone: "+254 700 111 222", email: "david@jbleastafrica.com", location: "Nairobi, Kenya", products: 1, status: "active", balance: 0      },
  { id: "5", name: "Mobile World",      contact: "Grace Uwase",  phone: "+250 733 456 789", email: "grace@mobileworld.rw", location: "Kigali, Rwanda",  products: 2, status: "inactive", balance: 15000 },
];

function fmt(v: number) { return v > 0 ? `RWF ${v.toLocaleString()}` : "—"; }

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", contact: "", phone: "", email: "", location: "" });

  const filtered = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.contact.toLowerCase().includes(search.toLowerCase()) ||
      s.location.toLowerCase().includes(search.toLowerCase())
  );

  function handleAdd() {
    if (!form.name.trim()) return;
    setSuppliers((prev) => [...prev, { id: String(Date.now()), ...form, products: 0, status: "active", balance: 0 }]);
    setForm({ name: "", contact: "", phone: "", email: "", location: "" });
    setAdding(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Suppliers</h1>
          <p className="text-xs text-muted mt-0.5">{suppliers.length} suppliers</p>
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90 transition-colors">
          <Plus size={15} /> Add Supplier
        </button>
      </div>

      {adding && (
        <div className="bg-card border border-border p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">New Supplier</p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { key: "name",     placeholder: "Company name" },
              { key: "contact",  placeholder: "Contact person" },
              { key: "phone",    placeholder: "Phone number" },
              { key: "email",    placeholder: "Email address" },
              { key: "location", placeholder: "Location / City" },
            ].map((f) => (
              <input key={f.key} type="text" placeholder={f.placeholder}
                value={form[f.key as keyof typeof form]}
                onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                className="px-3 py-2 border border-border text-sm focus:border-foreground/30 outline-none"
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="px-4 py-2 bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors">Save</button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 border border-border text-sm text-muted hover:text-foreground transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Suppliers",  value: suppliers.length,                                          color: "#af9164" },
          { label: "Active",           value: suppliers.filter((s) => s.status === "active").length,     color: "#10B981" },
          { label: "Outstanding Balance", value: `RWF ${suppliers.reduce((s, x) => s + x.balance, 0).toLocaleString()}`, color: "#ef4444" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border p-4 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: s.color }} />
            <p className="text-xl font-extrabold text-foreground tracking-tight">{s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border">
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input type="text" placeholder="Search suppliers..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-border text-sm focus:border-foreground/30 outline-none" />
          </div>
        </div>
        <div className="divide-y divide-border">
          {filtered.map((s) => (
            <div key={s.id} className="px-4 py-4 flex items-start gap-4 hover:bg-surface/40 transition-colors">
              <div className="w-10 h-10 bg-accent/10 flex items-center justify-center flex-shrink-0 text-sm font-bold text-accent">
                {s.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-foreground">{s.name}</p>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 ${s.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-surface text-muted"}`}>
                    {s.status}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span className="flex items-center gap-1"><Phone size={10} /> {s.phone}</span>
                  <span className="flex items-center gap-1"><Mail size={10} /> {s.email}</span>
                  <span className="flex items-center gap-1"><MapPin size={10} /> {s.location}</span>
                  <span className="flex items-center gap-1"><Package size={10} /> {s.products} products</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`text-sm font-bold ${s.balance > 0 ? "text-red-600" : "text-muted"}`}>{fmt(s.balance)}</p>
                <p className="text-[10px] text-muted mt-0.5">Outstanding</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button className="w-7 h-7 flex items-center justify-center text-muted hover:text-foreground hover:bg-surface rounded transition-colors">
                  <Edit2 size={13} />
                </button>
                <button className="w-7 h-7 flex items-center justify-center text-muted hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted">No suppliers found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
