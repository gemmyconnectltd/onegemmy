"use client";
import { useState, useMemo } from "react";
import {
  Plus,
  Building2,
  Trash2,
  Eye,
  Search,
  Filter,
  AlertTriangle,
  Activity,
} from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { Toggle } from "@/components/ui/Toggle";
import { fmtRelative } from "@/lib/date";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { tenantStatusLabel, type AdminTenant } from "@/lib/api/admin";
import {
  useTenants,
  useCreateTenant,
  useSuspendTenant,
  useActivateTenant,
  useDeleteTenant,
  useAdminFeatureUsage,
} from "@/lib/api/hooks";
import Link from "next/link";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/useBulkSelection";
import { DonutChart } from "@/components/charts/lazy";
import { chartPalette } from "@/lib/chartColors";
import { useAppConfig } from "@/lib/appConfig";

const PLAN_COLORS: Record<string, string> = {
  free: "bg-surface text-muted border border-border",
  starter:
    "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20",
  professional:
    "bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20",
  enterprise:
    "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
};

const MODULE_COLORS: Record<string, string> = {
  sales: "#6366f1",
  inventory: "#0ea5e9",
  accounting: "#10b981",
  hr: "#8b5cf6",
  procurement: "#f59e0b",
  manufacturing: "#f43f5e",
  crm: "#06b6d4",
  repairs: "#64748b",
};

/** Green/amber/red at a glance — a super-admin scanning this wants to spot
 *  the neglected feature immediately, not do the math themselves. */
function adoptionBadgeClass(pct: number) {
  if (pct >= 66) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (pct >= 33) return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return "bg-red-500/10 text-red-600 dark:text-red-400";
}

export default function AdminTenantsPage() {
  const { theme } = useAppConfig();
  const chartColors = chartPalette(theme === "dark");
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<
    "all" | "active" | "suspended"
  >("all");
  const [filterPlan, setFilterPlan] = useState("all");
  const [form, setForm] = useState({
    name: "",
    slug: "",
    subscription_plan: "free",
    phone: "",
    city: "",
    country: "Rwanda",
  });

  const { data, isLoading, isError } = useTenants(1, 200);
  const tenants = data?.items ?? [];
  const { data: featureUsage } = useAdminFeatureUsage();

  const createTenant = useCreateTenant();
  const suspendTenant = useSuspendTenant();
  const activateTenant = useActivateTenant();
  const deleteTenant = useDeleteTenant();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const filtered = useMemo(() => {
    return tenants.filter((t) => {
      const matchSearch =
        !search ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.slug.toLowerCase().includes(search.toLowerCase());
      const matchStatus =
        filterStatus === "all" ||
        (filterStatus === "active" ? t.is_active : !t.is_active);
      const matchPlan =
        filterPlan === "all" || t.subscription_plan === filterPlan;
      return matchSearch && matchStatus && matchPlan;
    });
  }, [tenants, search, filterStatus, filterPlan]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createTenant.mutate(form, {
      onSuccess: () => {
        setShowCreate(false);
        setForm({
          name: "",
          slug: "",
          subscription_plan: "free",
          phone: "",
          city: "",
          country: "Rwanda",
        });
      },
      onError: (err: unknown) =>
        setNotice(
          (err as { detail?: string })?.detail ?? "Failed to create tenant",
        ),
    });
  };

  const toggleStatus = (t: AdminTenant) => {
    const run = () => {
      setActing(t.id);
      if (t.is_active) {
        suspendTenant.mutate(t.id, {
          onError: () => setError("Failed to suspend tenant"),
          onSettled: () => setActing(null),
        });
      } else {
        activateTenant.mutate(
          { id: t.id },
          {
            onError: () => setError("Failed to activate tenant"),
            onSettled: () => setActing(null),
          },
        );
      }
    };
    if (t.is_active) {
      confirm({
        title: "Suspend organization?",
        message: `Suspend "${t.name}"? This logs out everyone in the company immediately.`,
        confirmLabel: "Suspend",
        danger: true,
        onConfirm: run,
      });
    } else {
      run();
    }
  };

  const remove = (t: AdminTenant) => {
    confirm({
      title: "Delete organization?",
      message: `Delete "${t.name}"? This is irreversible.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => {
        setActing(t.id);
        deleteTenant.mutate(t.id, {
          onError: () => setError("Failed to delete tenant"),
          onSettled: () => setActing(null),
        });
      },
    });
  };

  const bulk = useBulkSelection(filtered.map((t) => t.id));
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function confirmBulkDelete() {
    confirm({
      title: "Delete organizations?",
      message: `Permanently delete ${bulk.count} selected business${bulk.count === 1 ? "" : "es"} and ALL of their data (users, products, sales, everything)? This is irreversible.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setBulkDeleting(true);
        await Promise.allSettled(
          Array.from(bulk.selected).map((id) => deleteTenant.mutateAsync(id)),
        );
        setBulkDeleting(false);
        bulk.clear();
      },
    });
  }

  const handleNameChange = (name: string) => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    setForm((f) => ({ ...f, name, slug }));
  };

  const plans = [...new Set(tenants.map((t) => t.subscription_plan))];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">
            Tenants
          </h1>
          <p className="text-sm text-muted mt-0.5">
            {tenants.length} registered businesses ·{" "}
            {tenants.filter((t) => t.is_active).length} active
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent/90 text-white text-sm font-semibold transition-colors shadow-sm"
        >
          <Plus size={15} /> New Tenant
        </button>
      </div>

      {confirmDialog}

      {error && (
        <div className="flex items-center gap-3 text-red-600 dark:text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertTriangle size={15} /> {error}
          <button
            onClick={() => setError(null)}
            className="ml-auto text-muted hover:text-foreground text-xs font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Feature usage — how much each module is actually being used, platform-wide.
          A small donut (share of total activity) plus a compact legend, kept to
          one short row instead of a tall chart or an 8-row list. */}
      {featureUsage && featureUsage.modules.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={13} className="text-indigo-500 flex-shrink-0" />
            <h3 className="text-[12.5px] font-bold text-foreground">Feature Usage</h3>
            <p className="text-[11px] text-muted">— share of activity across all {featureUsage.total_tenants} tenants</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-[76px] h-[76px] flex-shrink-0">
              <DonutChart
                data={featureUsage.modules.map((m) => ({ name: m.label, value: m.total_records }))}
                colors={featureUsage.modules.map((m) => MODULE_COLORS[m.key] ?? "#64748b")}
                innerRadius={22}
                outerRadius={38}
                tooltipStyle={chartColors.tooltip}
              />
            </div>
            <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5">
              {featureUsage.modules.map((m) => {
                const color = MODULE_COLORS[m.key] ?? "#64748b";
                return (
                  <div key={m.key} className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-[10.5px] text-foreground/80 truncate flex-1">{m.label}</span>
                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${adoptionBadgeClass(m.adoption_pct)}`}>
                      {m.adoption_pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
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
            onChange={(e) =>
              setFilterStatus(e.target.value as typeof filterStatus)
            }
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
            {plans.map((p) => (
              <option key={p} value={p} className="capitalize">
                {p}
              </option>
            ))}
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
          <div className="overflow-x-auto">
            {bulk.count > 0 && (
              <div className="px-5 py-3 border-b border-border">
                <BulkActionBar
                  count={bulk.count}
                  label="organization"
                  pluralLabel="organizations"
                  onDelete={confirmBulkDelete}
                  onClear={bulk.clear}
                  deleting={bulkDeleting}
                />
              </div>
            )}
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] text-muted uppercase tracking-wider bg-surface/50">
                  <th className="px-5 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={bulk.allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = bulk.someSelected;
                      }}
                      onChange={bulk.toggleAll}
                      className="w-4 h-4 rounded"
                      disabled={filtered.length === 0}
                    />
                  </th>
                  <th className="px-5 py-3 font-semibold">Business</th>
                  <th className="px-5 py-3 font-semibold">Plan</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold hidden lg:table-cell">
                    Usage
                  </th>
                  <th className="px-5 py-3 font-semibold hidden lg:table-cell">
                    Last Active
                  </th>
                  <th className="px-5 py-3 font-semibold hidden sm:table-cell">
                    Location
                  </th>
                  <th className="px-5 py-3 font-semibold hidden md:table-cell">
                    Created
                  </th>
                  <th className="px-5 py-3 font-semibold text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-surface/40 transition-colors group"
                  >
                    <td className="px-5 py-4">
                      <input
                        type="checkbox"
                        checked={bulk.selected.has(t.id)}
                        onChange={() => bulk.toggle(t.id)}
                        className="w-4 h-4 rounded"
                      />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 flex items-center justify-center flex-shrink-0 border border-violet-500/10">
                          <span className="text-[13px] font-bold text-violet-600 dark:text-violet-400">
                            {t.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {t.name}
                          </p>
                          <p className="text-[11px] text-muted font-mono">
                            {t.slug}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`text-[11px] font-semibold px-2 py-1 rounded-lg capitalize ${PLAN_COLORS[t.subscription_plan] ?? "bg-surface text-muted"}`}
                      >
                        {t.subscription_plan}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <Toggle
                          checked={t.is_active}
                          onChange={() => toggleStatus(t)}
                          loading={acting === t.id}
                          size="sm"
                          label={
                            t.is_active
                              ? `Suspend ${t.name}`
                              : `${t.subscription_status === "pending" ? "Approve" : "Activate"} ${t.name}`
                          }
                        />
                        <span
                          className={`text-[11px] font-semibold ${t.is_active ? "text-emerald-600 dark:text-emerald-400" : t.subscription_status === "pending" ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}
                        >
                          {tenantStatusLabel(t)}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      {t.usage ? (
                        <div className="flex items-center gap-2">
                          <Activity size={12} className="text-muted flex-shrink-0" />
                          <div>
                            <p className="text-[12px] font-semibold text-foreground">
                              {t.usage.orders} order{t.usage.orders === 1 ? "" : "s"}
                            </p>
                            <p className="text-[11px] text-muted">
                              {t.currency} {t.usage.revenue.toLocaleString()} · {t.usage.users} user{t.usage.users === 1 ? "" : "s"}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[12px] text-muted">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell text-[12px] text-muted">
                      {t.usage ? fmtRelative(t.usage.last_active_at) : "—"}
                    </td>
                    <td className="px-5 py-4 hidden sm:table-cell text-[12px] text-muted">
                      {[t.city, t.country].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell text-[12px] text-muted">
                      {t.created_at
                        ? new Date(t.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/admin/tenants/${t.id}`}
                          className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors text-[12px] font-semibold"
                        >
                          <Eye size={13} /> Manage
                        </Link>
                        <button
                          onClick={() => remove(t)}
                          disabled={acting === t.id}
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
          </div>
          {filtered.length === 0 && (
            <div className="py-16 text-center">
              <Building2 size={32} className="text-muted/30 mx-auto mb-3" />
              <p className="text-sm font-semibold text-foreground">
                {search || filterStatus !== "all" || filterPlan !== "all"
                  ? "No tenants match your filters"
                  : "No tenants yet"}
              </p>
              <p className="text-[12px] text-muted mt-1">
                {search || filterStatus !== "all" || filterPlan !== "all"
                  ? "Try adjusting your search or filters"
                  : "Create your first tenant to get started"}
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

      <Drawer
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Onboard New Tenant"
        description="Create a new business on the platform"
      >
        <form onSubmit={handleCreate} className="space-y-4 p-5">
          {notice && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {notice}
            </p>
          )}
          <Field label="Business Name" required>
            <Input
              required
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Acme Corp"
            />
          </Field>
          <Field label="Slug (URL identifier)" required>
            <Input
              required
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="acme-corp"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Plan">
              <Select
                value={form.subscription_plan}
                onChange={(e) =>
                  setForm({ ...form, subscription_plan: e.target.value })
                }
              >
                {["free", "starter", "professional", "enterprise"].map((p) => (
                  <option key={p} value={p} className="capitalize">
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+250..."
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <Input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="Kigali"
              />
            </Field>
            <Field label="Country">
              <Input
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                placeholder="Rwanda"
              />
            </Field>
          </div>
          <FormFooter
            submitLabel={createTenant.isPending ? "Creating…" : "Create Tenant"}
            onCancel={() => setShowCreate(false)}
            disabled={createTenant.isPending}
          />
        </form>
      </Drawer>
    </div>
  );
}
