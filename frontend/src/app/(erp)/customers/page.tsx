"use client";
import { fmtMoney } from "@/lib/config";
import { useAppConfig } from "@/lib/appConfig";
import { useState, useMemo } from "react";
import {
  Users, Plus, Search, Phone, Mail, MapPin, TrendingUp, Star,
  Edit2, Trash2, Loader2, AlertCircle, ShoppingCart, CheckCircle2,
  UserCheck, UserX, Building2,
} from "lucide-react";
import { useCustomers, useOrders, useCreateCustomer, useUpdateCustomer, useDeleteCustomer } from "@/lib/api/hooks";
import type { ApiCustomer, ApiOrder } from "@/lib/api/sales";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";

const COLOR = "#0f766e";

const TYPE_OPTS = ["individual", "business", "vip", "wholesale"];

const EMPTY_FORM = {
  name: "", email: "", phone: "", address: "",
  customer_type: "individual", is_active: true,
};
type FormState = typeof EMPTY_FORM;

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function typeBadge(type: string) {
  const map: Record<string, string> = {
    individual: "bg-blue-100 text-blue-700",
    business:   "bg-purple-100 text-purple-700",
    vip:        "bg-amber-100 text-amber-700",
    wholesale:  "bg-emerald-100 text-emerald-700",
  };
  return map[type] ?? "bg-surface text-muted";
}

export default function CustomersPage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);

  const [error, setError] = useState<string | null>(null);
  const [shownLoadError, setShownLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<ApiCustomer | null>(null);
  const [viewing, setViewing] = useState<ApiCustomer | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const customersQ = useCustomers(1, 500);
  const ordersQ = useOrders(1, 500);
  const loading = customersQ.isLoading || ordersQ.isLoading;
  const customers = useMemo(() => customersQ.data?.items ?? [], [customersQ.data]);
  const orders = useMemo(() => ordersQ.data?.items ?? [], [ordersQ.data]);

  const loadError = customersQ.error ?? ordersQ.error;
  const loadErrorMessage = loadError ? (loadError as { detail?: string })?.detail ?? "Failed to load customers" : null;
  if (loadErrorMessage !== shownLoadError) {
    setShownLoadError(loadErrorMessage);
    if (loadErrorMessage !== null) setError(loadErrorMessage);
  }

  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();
  const saving = createCustomer.isPending || updateCustomer.isPending;

  // orders grouped by customer_id
  const ordersByCustomer = useMemo(() => {
    const map: Record<string, ApiOrder[]> = {};
    for (const o of orders) {
      if (o.customer_id) {
        if (!map[o.customer_id]) map[o.customer_id] = [];
        map[o.customer_id].push(o);
      }
    }
    return map;
  }, [orders]);

  const totalSpent = (id: string) =>
    (ordersByCustomer[id] ?? []).filter((o) => o.status === "Completed").reduce((s, o) => s + o.total, 0);

  const lastOrder = (id: string) => {
    const os = (ordersByCustomer[id] ?? []).sort((a, b) =>
      new Date(b.ordered_at ?? 0).getTime() - new Date(a.ordered_at ?? 0).getTime()
    );
    return os[0]?.ordered_at?.slice(0, 10) ?? null;
  };

  // stats
  const totalRevenue = customers.reduce((s, c) => s + totalSpent(c.id), 0);
  const topSpender = [...customers].sort((a, b) => totalSpent(b.id) - totalSpent(a.id))[0];
  const activeCount = customers.filter((c) => c.is_active).length;

  const stats = [
    { label: "Total Customers", value: String(customers.length), icon: Users,       color: COLOR },
    { label: "Active",          value: String(activeCount),       icon: UserCheck,   color: "#10b981" },
    { label: "Total Revenue",   value: fmt(totalRevenue),         icon: TrendingUp,  color: "#0284c7" },
    { label: "Top Spender",     value: topSpender ? topSpender.name.split(" ")[0] : "—", icon: Star, color: "#b45309" },
  ];

  // filter
  const displayed = customers.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch = c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q) || (c.email ?? "").toLowerCase().includes(q);
    const matchType = typeFilter === "All" || c.customer_type === typeFilter;
    return matchSearch && matchType;
  });

  // form helpers
  const openAdd = () => { setForm(EMPTY_FORM); setFormError(null); setShowAdd(true); };
  const openEdit = (c: ApiCustomer) => {
    setEditing(c);
    setForm({ name: c.name, email: c.email ?? "", phone: c.phone ?? "", address: c.address ?? "", customer_type: c.customer_type, is_active: c.is_active });
    setFormError(null);
  };
  const closeDrawer = () => { setShowAdd(false); setEditing(null); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      customer_type: form.customer_type,
      is_active: form.is_active,
    };
    const onError = (err: Error) => setFormError((err as { detail?: string })?.detail ?? "Failed to save customer");
    const onSuccess = () => { setError(null); closeDrawer(); };
    if (editing) {
      updateCustomer.mutate({ id: editing.id, data: payload }, { onSuccess, onError });
    } else {
      createCustomer.mutate(payload, { onSuccess, onError });
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this customer? This cannot be undone.")) return;
    deleteCustomer.mutate(id, {
      onSuccess: () => { if (viewing?.id === id) setViewing(null); },
      onError: (err: Error) => setError((err as { detail?: string })?.detail ?? "Failed to delete customer"),
    });
  };

  const viewingOrders = viewing ? (ordersByCustomer[viewing.id] ?? []).sort((a, b) =>
    new Date(b.ordered_at ?? 0).getTime() - new Date(a.ordered_at ?? 0).getTime()
  ) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Customers</h1>
          <p className="text-sm text-muted mt-0.5">{loading ? "Loading..." : `${customers.length} total customers`}</p>
        </div>
        <Button color={COLOR} onClick={openAdd}><Plus size={15} /> Add Customer</Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} /> {error}
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 hover:shadow-md transition-all">
            <div className="w-8 h-8 flex items-center justify-center rounded-xl mb-2" style={{ backgroundColor: `${s.color}15` }}>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <p className="text-xl font-extrabold text-foreground tracking-tight">{loading ? "—" : s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 w-64 focus-within:border-foreground/20 transition-colors">
          <Search size={14} className="text-muted flex-shrink-0" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, email..."
            className="flex-1 text-[13px] outline-none bg-transparent text-foreground placeholder:text-muted" />
        </div>
        <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1">
          {["All", ...TYPE_OPTS].map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors capitalize ${typeFilter === t ? "text-white" : "text-foreground/50 hover:text-foreground"}`}
              style={typeFilter === t ? { backgroundColor: COLOR } : undefined}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-20 flex items-center justify-center gap-2 text-muted">
          <Loader2 size={18} className="animate-spin" /> Loading customers...
        </div>
      ) : displayed.length === 0 ? (
        <div className="py-20 text-center bg-card border border-border rounded-xl">
          <Users size={32} className="text-border mx-auto mb-3" />
          <p className="text-sm font-semibold text-muted">No customers found</p>
          <p className="text-xs text-muted mt-1 mb-4">Add your first customer to start tracking purchases</p>
          <Button color={COLOR} size="sm" onClick={openAdd}><Plus size={13} /> Add Customer</Button>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Customer</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Contact</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Type</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Orders</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Last Order</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide text-right">Total Spent</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayed.map((c) => {
                const spent = totalSpent(c.id);
                const orderCount = (ordersByCustomer[c.id] ?? []).length;
                const last = lastOrder(c.id);
                return (
                  <tr key={c.id} className="hover:bg-surface/50 transition-colors group cursor-pointer"
                    onClick={() => setViewing(c)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                          style={{ backgroundColor: COLOR }}>
                          {initials(c.name)}
                        </div>
                        <span className="text-sm font-semibold text-foreground">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        {c.phone && <div className="flex items-center gap-1.5 text-[12px] text-muted"><Phone size={11} /> {c.phone}</div>}
                        {c.email && <div className="flex items-center gap-1.5 text-[12px] text-muted"><Mail size={11} /> {c.email}</div>}
                        {!c.phone && !c.email && <span className="text-[12px] text-muted">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${typeBadge(c.customer_type)}`}>
                        {c.customer_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted tabular-nums">{orderCount}</td>
                    <td className="px-4 py-3 text-sm text-muted">{last ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-foreground tabular-nums font-mono">
                      {spent > 0 ? fmt(spent) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${c.is_active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                        {c.is_active ? <CheckCircle2 size={10} /> : <UserX size={10} />}
                        {c.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => openEdit(c)}
                          className="w-7 h-7 flex items-center justify-center text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => handleDelete(c.id)}
                          className="w-7 h-7 flex items-center justify-center text-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* View Drawer */}
      <Drawer open={!!viewing} onClose={() => setViewing(null)}
        title={viewing?.name ?? ""} description={viewing?.customer_type} size="md">
        {viewing && (
          <div className="p-5 space-y-5">
            {/* info */}
            <div className="bg-surface rounded-xl p-4 space-y-3">
              {[
                { icon: Phone,    label: "Phone",   value: viewing.phone ?? "—" },
                { icon: Mail,     label: "Email",   value: viewing.email ?? "—" },
                { icon: MapPin,   label: "Address", value: viewing.address ?? "—" },
                { icon: Building2,label: "Type",    value: viewing.customer_type },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[12px] text-muted">
                    <Icon size={13} /> {label}
                  </div>
                  <span className="text-[13px] font-semibold text-foreground capitalize">{value}</span>
                </div>
              ))}
            </div>

            {/* spend summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface rounded-xl p-3 text-center">
                <p className="text-lg font-extrabold text-foreground">{viewingOrders.length}</p>
                <p className="text-[11px] text-muted mt-0.5">Total Orders</p>
              </div>
              <div className="bg-surface rounded-xl p-3 text-center">
                <p className="text-lg font-extrabold text-foreground font-mono">{fmt(totalSpent(viewing.id))}</p>
                <p className="text-[11px] text-muted mt-0.5">Total Spent</p>
              </div>
            </div>

            {/* order history */}
            {viewingOrders.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
                  <ShoppingCart size={12} /> Order History
                </p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {viewingOrders.map((o) => (
                    <div key={o.id} className="flex items-center justify-between bg-surface rounded-xl px-3 py-2.5">
                      <div>
                        <p className="text-[13px] font-semibold text-foreground">{o.order_number}</p>
                        <p className="text-[11px] text-muted">{o.ordered_at?.slice(0, 10) ?? "—"} · {o.items.length} item{o.items.length !== 1 ? "s" : ""}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[13px] font-bold text-foreground tabular-nums font-mono">{fmt(o.total)}</p>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${o.status === "Completed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {o.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* actions */}
            <div className="flex gap-2 pt-1">
              <Button color={COLOR} size="sm" onClick={() => { setViewing(null); openEdit(viewing); }}>
                <Edit2 size={13} /> Edit
              </Button>
              <Button variant="danger" size="sm" onClick={() => handleDelete(viewing.id)}>
                <Trash2 size={13} /> Delete
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Add / Edit Drawer */}
      <Drawer open={showAdd || !!editing} onClose={closeDrawer}
        title={editing ? "Edit Customer" : "New Customer"}
        description={editing ? editing.name : "Add a customer to track their orders and spending"}
        size="sm">
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <Field label="Full Name" required>
            <Input autoFocus value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Jean Pierre" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input type="tel" value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+250 788 123 456" />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="jean@example.com" />
            </Field>
          </div>
          <Field label="Address">
            <Input value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="Street, City" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer Type">
              <Select value={form.customer_type}
                onChange={(e) => setForm((f) => ({ ...f, customer_type: e.target.value }))}>
                {TYPE_OPTS.map((t) => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.is_active ? "active" : "inactive"}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === "active" }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
          </div>

          {formError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
          )}

          <FormFooter
            submitLabel={saving ? "Saving..." : editing ? "Save Changes" : "Add Customer"}
            onCancel={closeDrawer}
            disabled={saving || !form.name.trim()}
            color={COLOR}
          />
        </form>
      </Drawer>
    </div>
  );
}
