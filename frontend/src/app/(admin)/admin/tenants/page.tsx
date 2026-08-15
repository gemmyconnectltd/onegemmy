"use client";
import { useState, useMemo } from "react";
import { Plus, Building2, CheckCircle, XCircle, Trash2, Eye, PauseCircle, PlayCircle, Loader2, Search, Filter, AlertTriangle } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import type { AdminTenant } from "@/lib/api/admin";
import { useTenants, useCreateTenant, useSuspendTenant, useActivateTenant, useDeleteTenant } from "@/lib/api/hooks";
import Link from "next/link";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";

const PLAN_COLORS: Record<string, string> = {
  free: "bg-surface text-muted border border-border",
  starter: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20",
  professional: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20",
  enterprise: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
};

export default function AdminTenantsPage() {
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "suspended">("all");
  const [filterPlan, setFilterPlan] = useState("all");
  const [form, setForm] = useState({ name: "", slug: "", subscription_plan: "free", phone: "", city: "", country: "Rwanda" });

  const { data, isLoading, isError } = useTenants(1, 200);
  const tenants = data?.items ?? [];

  const createTenant = useCreateTenant();
  const suspendTenant = useSuspendTenant();
  const activateTenant = useActivateTenant();
  const deleteTenant = useDeleteTenant();

  const filtered = useMemo(() => {
    return tenants.filter((t) => {
      const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.slug.toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus === "all" || (filterStatus === "active" ? t.is_active : !t.is_active);
      const matchPlan = filterPlan === "all" || t.subscription_plan === filterPlan;
      return matchSearch && matchStatus && matchPlan;
    });
  }, [tenants, search, filterStatus, filterPlan]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createTenant.mutate(form, {
      onSuccess: () => {
        setShowCreate(false);
        setForm({ name: "", slug: "", subscription_plan: "free", phone: "", city: "", country: "Rwanda" });
      },
      onError: (err: unknown) => setNotice((err as { detail?: string })?.detail ?? "Failed to create tenant"),
    });
  };

  const suspend = (t: AdminTenant) => {
    setActing(t.id);
    suspendTenant.mutate(t.id, {
      onError: () => setError("Failed to suspend tenant"),
      onSettled: () => setActing(null),
    });
  };

  const activate = (t: AdminTenant) => {
    setActing(t.id);
    activateTenant.mutate(t.id, {
      onError: () => setError("Failed to activate tenant"),
      onSettled: () => setActing(null),
    });
  };

  const remove = (t: AdminTenant) => {
    if (!confirm(`Delete "${t.name}"? This is irreversible.`)) return;
    setActing(t.id);
    deleteTenant.mutate(t.id, {
      onError: () => setError("Failed to delete tenant"),
      onSettled: () => setActing(null),
    });
  };

  const handleNameChange = (name: string) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    setForm((f) => ({ ...f, name, slug }));
  };

  const plans = [...new Set(tenants.map((t) => t.subscription_plan))];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Tenants</h1>
          <p className="text-sm text-muted mt-0.5">
            {tenants.length} registered businesses · {tenants.filter(t => t.is_active).length} active
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent/90 text-white text-sm font-semibold transition-colors shadow-sm"
        >
          <Plus size={15} /> New Tenant
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 text-red-600 dark:text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertTriangle size={15} /> {error}
          <button onClick={() => setError(null)} className="ml-auto text-muted hover:text-foreground text-xs font-medium">Dismiss</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or slug..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-card border border-border rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all"
          />
        </div>
        <div className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border rounded-xl">
          <Filter size={13} className="text-muted" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            className="text-sm bg-transparent text-foreground focus:outline-none cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border rounded-xl">
          <select
            value={filterPlan}
            onChange={(e) => setFilterPlan(e.target.value)}
            className="text-sm bg-transparent text-foreground focus:outline-none cursor-pointer capitalize"
          >
            <option value="all">All Plans</option>
            {plans.map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}
          </select>
        </div>
      </div>

      {isLoading ? (
        <PageLoader variant="compact" />
      ) : isError ? (
        <div className="flex items-center gap-3 text-red-600 dark:text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertTriangle size={15} /> Failed to load tenants
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-muted uppercase tracking-wider bg-surface/50">
                <th className="px-5 py-3 font-semibold">Business</th>
                <th className="px-5 py-3 font-semibold">Plan</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold hidden sm:table-cell">Location</th>
                <th className="px-5 py-3 font-semibold hidden md:table-cell">Created</th>
                <th className="px-5 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-surface/40 transition-colors group">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 flex items-center justify-center flex-shrink-0 border border-violet-500/10">
                        <span className="text-[13px] font-bold text-violet-600 dark:text-violet-400">
                          {t.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{t.name}</p>
                        <p className="text-[11px] text-muted font-mono">{t.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-[11px] font-semibold px-2 py-1 rounded-lg capitalize ${PLAN_COLORS[t.subscription_plan] ?? "bg-surface text-muted"}`}>
                      {t.subscription_plan}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`flex items-center gap-1.5 text-[11px] font-semibold w-fit px-2 py-1 rounded-lg ${t.is_active ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}>
                      {t.is_active ? <CheckCircle size={11} /> : <XCircle size={11} />}
                      {t.is_active ? "Active" : "Suspended"}
                    </span>
                  </td>
                  <td className="px-5 py-4 hidden sm:table-cell text-[12px] text-muted">
                    {[t.city, t.country].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell text-[12px] text-muted">
                    {t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link href={`/admin/tenants/${t.id}`}
                        className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors text-[12px] font-semibold"
                      >
                        <Eye size={13} /> Manage
                      </Link>
                      {t.is_active ? (
                        <button onClick={() => suspend(t)} disabled={acting === t.id}
                          className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors text-[12px] font-semibold disabled:opacity-40"
                        >
                          {acting === t.id ? <Loader2 size={12} className="animate-spin" /> : <PauseCircle size={13} />} Suspend
                        </button>
                      ) : (
                        <button onClick={() => activate(t)} disabled={acting === t.id}
                          className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors text-[12px] font-semibold disabled:opacity-40"
                        >
                          {acting === t.id ? <Loader2 size={12} className="animate-spin" /> : <PlayCircle size={13} />} Activate
                        </button>
                      )}
                      <button onClick={() => remove(t)} disabled={acting === t.id}
                        className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold disabled:opacity-50"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-16 text-center">
              <Building2 size={32} className="text-muted/30 mx-auto mb-3" />
              <p className="text-sm font-semibold text-foreground">
                {search || filterStatus !== "all" || filterPlan !== "all" ? "No tenants match your filters" : "No tenants yet"}
              </p>
              <p className="text-[12px] text-muted mt-1">
                {search || filterStatus !== "all" || filterPlan !== "all" ? "Try adjusting your search or filters" : "Create your first tenant to get started"}
              </p>
            </div>
          )}
          {filtered.length > 0 && (
            <div className="px-5 py-3 border-t border-border bg-surface/30 text-[11px] text-muted">
              Showing {filtered.length} of {tenants.length} tenants
            </div>
          )}
        </div>
      )}

      <Drawer open={showCreate} onClose={() => setShowCreate(false)} title="Onboard New Tenant" description="Create a new business on the platform">
        <form onSubmit={handleCreate} className="space-y-4 p-5">
          {notice && <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{notice}</p>}
          <Field label="Business Name" required>
            <Input required value={form.name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Acme Corp" />
          </Field>
          <Field label="Slug (URL identifier)" required>
            <Input required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="acme-corp" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Plan">
              <Select value={form.subscription_plan} onChange={(e) => setForm({ ...form, subscription_plan: e.target.value })}>
                {["free", "starter", "professional", "enterprise"].map((p) => (
                  <option key={p} value={p} className="capitalize">{p}</option>
                ))}
              </Select>
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+250..." />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Kigali" />
            </Field>
            <Field label="Country">
              <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="Rwanda" />
            </Field>
          </div>
          <FormFooter submitLabel={createTenant.isPending ? "Creating…" : "Create Tenant"} onCancel={() => setShowCreate(false)} disabled={createTenant.isPending} />
        </form>
      </Drawer>
    </div>
  );
}
