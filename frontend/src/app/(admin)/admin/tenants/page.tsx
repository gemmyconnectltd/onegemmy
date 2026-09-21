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
  Globe2,
  Crown,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  BarChart2,
} from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { Toggle } from "@/components/ui/Toggle";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { tenantStatusLabel, type AdminTenant } from "@/lib/api/admin";
import {
  useTenants,
  useCreateTenant,
  useSuspendTenant,
  useActivateTenant,
  useDeleteTenant,
  useAdminTenantAnalytics,
} from "@/lib/api/hooks";
import Link from "next/link";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/useBulkSelection";
import { DonutChart, TenantGrowthChart } from "@/components/charts/lazy";
import { BrandMark, type BrandKind } from "@/components/charts/BrandMark";
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

const PLAN_CHART_COLORS: Record<string, string> = {
  free: "#64748b",
  starter: "#0284c7",
  professional: "#8b5cf6",
  enterprise: "#d97706",
};

const STATUS_CHART_COLORS: Record<string, string> = {
  Active: "#10b981",
  Pending: "#f59e0b",
  Suspended: "#ef4444",
};

const COUNTRY_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#64748b"];

function MiniDonut({
  data, colors, tooltipStyle, kind = "none",
}: {
  data: { name: string; value: number }[];
  colors: string[];
  tooltipStyle: React.CSSProperties;
  kind?: BrandKind;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const visible = data.filter((d) => d.value > 0);
  return (
    <div className="flex items-center gap-4">
      <div className="w-[88px] h-[88px] flex-shrink-0">
        <DonutChart data={visible} colors={colors} innerRadius={26} outerRadius={44} tooltipStyle={tooltipStyle} />
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        {visible.slice(0, 5).map((d, i) => (
          <div key={d.name} className="flex items-center gap-2">
            <BrandMark kind={kind} name={d.name} color={colors[i % colors.length]} size={11} />
            <span className="text-[11.5px] text-foreground/80 truncate flex-1 capitalize">{d.name}</span>
            <span className="text-[10.5px] font-bold text-muted flex-shrink-0">
              {d.value} · {Math.round((d.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminTenantsPage() {
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
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
  const { data: analytics } = useAdminTenantAnalytics();

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

  // Build growth chart data with cumulative
  const growthData = useMemo(() => {
    if (!analytics?.monthly_signups.length) return [];
    const signupsInWindow = analytics.monthly_signups.reduce((s, m) => s + m.count, 0);
    const baseline = tenants.length - signupsInWindow;
    return analytics.monthly_signups.reduce<{ month: string; count: number; cumulative: number }[]>(
      (acc, m) => {
        const prev = acc.length ? acc[acc.length - 1].cumulative : baseline;
        return [...acc, { month: m.month, count: m.count, cumulative: prev + m.count }];
      },
      [],
    );
  }, [analytics, tenants.length]);

  const planChartData = (analytics?.by_plan ?? []).map((p) => ({
    name: p.name.charAt(0).toUpperCase() + p.name.slice(1),
    value: p.value,
  }));
  const planChartColors = planChartData.map((p) => PLAN_CHART_COLORS[p.name.toLowerCase()] ?? "#64748b");

  const statusChartData = (analytics?.by_status ?? []).filter((s) => s.value > 0);
  const statusChartColors = statusChartData.map((s) => STATUS_CHART_COLORS[s.name] ?? "#64748b");

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

      {/* Charts */}
      {analytics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Monthly signups */}
          <div className="sm:col-span-2 bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                <TrendingUp size={13} className="text-indigo-500" />
              </div>
              <h3 className="text-[13px] font-bold text-foreground">Tenant Growth</h3>
            </div>
            <p className="text-[11px] text-muted mb-3 ml-9">Monthly signups vs. cumulative total · last 12 months</p>
            <div className="h-44">
              {growthData.length > 0 ? (
                <TenantGrowthChart
                  data={growthData}
                  barColor="#6366f1"
                  lineColor="#f59e0b"
                  gridColor={c.grid}
                  tickColor={c.tick}
                  tooltipStyle={c.tooltip}
                />
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-[12px] text-muted">No signup data yet</p>
                </div>
              )}
            </div>
          </div>

          {/* Plan distribution */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                <Crown size={13} className="text-violet-500" />
              </div>
              <h3 className="text-[13px] font-bold text-foreground">By Plan</h3>
            </div>
            {planChartData.length > 0 ? (
              <MiniDonut data={planChartData} colors={planChartColors} tooltipStyle={c.tooltip} />
            ) : (
              <p className="text-[12px] text-muted text-center py-6">No data</p>
            )}
          </div>

          {/* Status distribution */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <BarChart2 size={13} className="text-emerald-600" />
              </div>
              <h3 className="text-[13px] font-bold text-foreground">By Status</h3>
            </div>
            {statusChartData.length > 0 ? (
              <MiniDonut data={statusChartData} colors={statusChartColors} tooltipStyle={c.tooltip} />
            ) : (
              <p className="text-[12px] text-muted text-center py-6">No data</p>
            )}
          </div>

          {/* By country */}
          <div className="sm:col-span-2 xl:col-span-2 bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-sky-500/10 flex items-center justify-center flex-shrink-0">
                <Globe2 size={13} className="text-sky-500" />
              </div>
              <h3 className="text-[13px] font-bold text-foreground">By Country</h3>
            </div>
            {analytics.by_country.length > 0 ? (
              <MiniDonut data={analytics.by_country} colors={COUNTRY_COLORS} tooltipStyle={c.tooltip} kind="country" />
            ) : (
              <p className="text-[12px] text-muted text-center py-6">No location data</p>
            )}
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
