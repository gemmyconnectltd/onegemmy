"use client";
import { fmtMoney } from "@/lib/config";
import { useState } from "react";
import { Plus, Search, Phone, Mail, Users, ShoppingCart, TrendingUp, Star } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, FormFooter } from "@/components/ui/Form";

interface Purchase { date: string; items: string; total: number; }
interface Customer {
  id: string; name: string; phone: string; email: string | null;
  totalPurchases: number; lastPurchaseAt: string; purchases: Purchase[];
}

const INITIAL: Customer[] = [
  { id: "1", name: "Jean Pierre",       phone: "+250 788 123 456", email: "jean@example.com",    totalPurchases: 125000, lastPurchaseAt: "2025-07-24", purchases: [{ date: "2025-07-24", items: "Phone Case x2", total: 10000 }, { date: "2025-07-20", items: "USB Cable x3", total: 9000 }] },
  { id: "2", name: "Marie Claire",      phone: "+250 788 234 567", email: null,                  totalPurchases: 87000,  lastPurchaseAt: "2025-07-23", purchases: [{ date: "2025-07-23", items: "Wireless Earbuds x1", total: 15000 }] },
  { id: "3", name: "Patrick Niyonzima", phone: "+250 788 345 678", email: "patrick@example.com", totalPurchases: 234000, lastPurchaseAt: "2025-07-22", purchases: [{ date: "2025-07-22", items: "Bluetooth Speaker x1", total: 25000 }] },
  { id: "4", name: "Immaculate",        phone: "+250 788 456 789", email: null,                  totalPurchases: 45000,  lastPurchaseAt: "2025-07-18", purchases: [] },
  { id: "5", name: "Eric Habimana",     phone: "+250 788 567 890", email: null,                  totalPurchases: 67000,  lastPurchaseAt: "2025-07-15", purchases: [] },
];

const COLOR = "#0f766e";

export default function CustomersPage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);

  const [customers, setCustomers] = useState<Customer[]>(INITIAL);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [viewing, setViewing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.email?.toLowerCase().includes(q) ?? false);
  });

  const totalRevenue = customers.reduce((s, c) => s + c.totalPurchases, 0);
  const topSpender = customers.reduce((a, b) => a.totalPurchases > b.totalPurchases ? a : b, customers[0]);

  const stats = [
    { label: "Total Customers", value: customers.length,  icon: Users,       color: COLOR },
    { label: "Total Revenue",   value: fmt(totalRevenue), icon: TrendingUp,  color: "#059669" },
    { label: "With Email",      value: customers.filter((c) => c.email).length, icon: Mail, color: "#0284c7" },
    { label: "Top Spender",     value: topSpender?.name.split(" ")[0] ?? "—", icon: Star, color: "#b45309" },
  ];

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) return;
    setCustomers((prev) => [{
      id: String(Date.now()), name: form.name.trim(), phone: form.phone.trim(),
      email: form.email.trim() || null, totalPurchases: 0, lastPurchaseAt: "", purchases: [],
    }, ...prev]);
    setForm({ name: "", phone: "", email: "" });
    setShowAdd(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Customers</h1>
          <p className="text-sm text-muted mt-0.5">{customers.length} total customers</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 text-white px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors" style={{ backgroundColor: COLOR }}>
          <Plus size={15} /> Add Customer
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 hover:shadow-md hover:border-foreground/15 transition-all">
            <div className="w-8 h-8 flex items-center justify-center rounded-xl mb-2" style={{ backgroundColor: `${s.color}15` }}>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">{s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 w-64">
            <Search size={14} className="text-muted flex-shrink-0" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customers..."
              className="flex-1 text-[13px] outline-none bg-transparent text-foreground placeholder:text-muted" />
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="p-4 font-semibold">Customer</th>
              <th className="p-4 font-semibold">Phone</th>
              <th className="p-4 font-semibold">Email</th>
              <th className="p-4 font-semibold text-right">Total Spent</th>
              <th className="p-4 font-semibold">Last Purchase</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((c) => (
              <tr key={c.id} onClick={() => setViewing(c)} className="hover:bg-surface/50 transition-colors cursor-pointer group">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: COLOR }}>
                      {c.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                    </div>
                    <span className="text-sm font-semibold text-foreground">{c.name}</span>
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-1.5 text-[13px] text-muted">
                    <Phone size={12} /> {c.phone}
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-1.5 text-[13px] text-muted">
                    <Mail size={12} /> {c.email || "—"}
                  </div>
                </td>
                <td className="p-4 text-right text-sm font-bold text-foreground tabular-nums">{fmt(c.totalPurchases)}</td>
                <td className="p-4 text-[13px] text-muted">{c.lastPurchaseAt || "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="py-16 text-center text-sm text-muted">No customers found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* View drawer */}
      <Drawer open={!!viewing} onClose={() => setViewing(null)} title={viewing?.name ?? ""} description={viewing?.phone} size="md">
        {viewing && (
          <div className="p-5 space-y-4">
            {[
              { label: "Phone",         value: viewing.phone },
              { label: "Email",         value: viewing.email || "—" },
              { label: "Total Spent",   value: fmt(viewing.totalPurchases) },
              { label: "Last Purchase", value: viewing.lastPurchaseAt || "—" },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-[13px] text-muted font-medium">{label}</span>
                <span className="text-[13px] font-semibold text-foreground">{value}</span>
              </div>
            ))}
            {viewing.purchases.length > 0 && (
              <div className="pt-2">
                <p className="text-[12px] font-bold text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
                  <ShoppingCart size={13} /> Purchase History
                </p>
                <div className="space-y-2">
                  {viewing.purchases.map((p, i) => (
                    <div key={i} className="flex items-center justify-between bg-surface rounded-lg px-3 py-2">
                      <div>
                        <p className="text-[13px] font-semibold text-foreground">{p.items}</p>
                        <p className="text-[11px] text-muted">{p.date}</p>
                      </div>
                      <span className="text-[13px] font-bold text-foreground tabular-nums">{fmt(p.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Add drawer */}
      <Drawer open={showAdd} onClose={() => setShowAdd(false)} title="Add Customer" description="Save a customer to track their purchases" size="md">
        <form onSubmit={handleAdd} className="p-5 space-y-4">
          <Field label="Name" required>
            <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Jean Pierre" />
          </Field>
          <Field label="Phone" required>
            <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+250 788 123 456" />
          </Field>
          <Field label="Email" hint="Optional">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jean@example.com" />
          </Field>
          <FormFooter submitLabel="Add Customer" onCancel={() => setShowAdd(false)} disabled={!form.name.trim() || !form.phone.trim()} />
        </form>
      </Drawer>
    </div>
  );
}
