"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Users, ShoppingCart, TrendingUp, Package, UserPlus, Loader2, CheckCircle, XCircle, PauseCircle, PlayCircle } from "lucide-react";
import { useTenant, useTenantStats, useTenantUsers, useSuspendTenant, useActivateTenant, useInviteUser } from "@/lib/api/hooks";
import { fmtMoney } from "@/lib/config";
import { chartPalette } from "@/lib/chartColors";
import { useAppConfig } from "@/lib/appConfig";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import Link from "next/link";

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");

  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shownLoadError, setShownLoadError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", full_name: "", role: "member", password: "" });

  const { data: tenant, isLoading: tenantLoading, isError: tenantError } = useTenant(id);
  const { data: stats, isLoading: statsLoading, isError: statsError } = useTenantStats(id);
  const { data: usersData, isLoading: usersLoading, isError: usersError } = useTenantUsers(id);
  const users = usersData?.items ?? [];
  const loading = tenantLoading || statsLoading || usersLoading;
  const isError = tenantError || statsError || usersError;

  const loadErrorMessage = isError ? "Failed to load tenant" : null;
  if (loadErrorMessage !== shownLoadError) {
    setShownLoadError(loadErrorMessage);
    if (loadErrorMessage !== null) setError(loadErrorMessage);
  }

  const suspendTenant = useSuspendTenant();
  const activateTenant = useActivateTenant();
  const inviteUser = useInviteUser();

  const toggleStatus = () => {
    if (!tenant) return;
    setActing(true);
    const m = tenant.is_active ? suspendTenant : activateTenant;
    m.mutate(id, {
      onError: () => setError("Failed to update status"),
      onSettled: () => setActing(false),
    });
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    inviteUser.mutate({ tenantId: id, data: form }, {
      onSuccess: () => {
        setShowInvite(false);
        setForm({ email: "", full_name: "", role: "member", password: "" });
      },
      onError: (err: unknown) => setNotice((err as { detail?: string })?.detail ?? "Failed to invite user"),
    });
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={22} className="animate-spin text-accent" />
    </div>
  );

  if (error || !tenant) return (
    <div className="space-y-4">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors">
        <ArrowLeft size={14} /> Back
      </button>
      <div className="text-red-600 dark:text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error ?? "Tenant not found"}</div>
    </div>
  );

  const statCards = stats ? [
    { label: "Users",            value: stats.users,                          icon: Users,        color: c.primary },
    { label: "Total Orders",     value: stats.orders,                         icon: ShoppingCart, color: c.blue },
    { label: "Completed Orders", value: stats.completed_orders,               icon: CheckCircle,  color: c.income },
    { label: "Products",         value: stats.products,                       icon: Package,      color: c.gold },
    { label: "Revenue",          value: fmtMoney(stats.revenue), isStr: true, icon: TrendingUp,   color: c.profit },
  ] : [];

  const PLAN_COLORS: Record<string, string> = {
    free: "text-muted", starter: "text-blue-600 dark:text-blue-400", professional: "text-violet-600 dark:text-violet-400", enterprise: "text-amber-600 dark:text-amber-400",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin/tenants" className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface text-muted hover:text-foreground hover:bg-border transition-colors">
            <ArrowLeft size={15} />
          </Link>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">{tenant.name}</h1>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md capitalize ${tenant.is_active ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}>
                {tenant.is_active ? "Active" : "Suspended"}
              </span>
              <span className={`text-[11px] font-semibold capitalize ${PLAN_COLORS[tenant.subscription_plan] ?? "text-muted"}`}>
                {tenant.subscription_plan}
              </span>
            </div>
            <p className="text-sm text-muted mt-0.5 font-mono">{tenant.slug} {tenant.city && `· ${tenant.city}`} {tenant.country && `· ${tenant.country}`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent hover:bg-accent/90 text-white text-sm font-semibold transition-colors"
          >
            <UserPlus size={14} /> Invite User
          </button>
          <button
            onClick={toggleStatus}
            disabled={acting}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
              tenant.is_active
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
            }`}
          >
            {acting ? <Loader2 size={14} className="animate-spin" /> : tenant.is_active ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
            {tenant.is_active ? "Suspend" : "Activate"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {statCards.map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2.5" style={{ backgroundColor: `${card.color}18` }}>
              <card.icon size={14} style={{ color: card.color }} />
            </div>
            <p className="text-lg font-extrabold text-foreground tracking-tight truncate">{card.isStr ? card.value : Number(card.value).toLocaleString()}</p>
            <p className="text-[11px] text-muted mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Users table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Users ({users.length})</h2>
          <button onClick={() => setShowInvite(true)} className="flex items-center gap-1.5 text-[12px] font-semibold text-accent hover:underline transition-colors">
            <UserPlus size={13} /> Invite
          </button>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-[11px] text-muted uppercase tracking-wider">
              <th className="px-5 py-3 font-semibold">User</th>
              <th className="px-5 py-3 font-semibold">Role</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-surface/40 transition-colors">
                <td className="px-5 py-3.5">
                  <p className="text-sm font-medium text-foreground">{u.full_name}</p>
                  <p className="text-[11px] text-muted">{u.email}</p>
                </td>
                <td className="px-5 py-3.5">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-surface text-muted capitalize">{u.role}</span>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`flex items-center gap-1 text-[11px] font-semibold w-fit ${u.is_active ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {u.is_active ? <CheckCircle size={11} /> : <XCircle size={11} />}
                    {u.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-[12px] text-muted">
                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="py-12 text-center">
            <Users size={28} className="text-muted/30 mx-auto mb-2" />
            <p className="text-sm text-muted">No users yet</p>
          </div>
        )}
      </div>

      {/* Invite drawer */}
      <Drawer open={showInvite} onClose={() => setShowInvite(false)} title="Invite User" description={`Add a user to ${tenant.name}`}>
        <form onSubmit={handleInvite} className="space-y-4 p-5">
          {notice && <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{notice}</p>}
          <Field label="Full Name" required>
            <Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="John Doe" />
          </Field>
          <Field label="Email" required>
            <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@example.com" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {["admin", "member", "viewer"].map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
              </Select>
            </Field>
            <Field label="Temporary Password" required>
              <Input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
            </Field>
          </div>
          <FormFooter submitLabel={inviteUser.isPending ? "Inviting…" : "Invite User"} onCancel={() => setShowInvite(false)} disabled={inviteUser.isPending} />
        </form>
      </Drawer>
    </div>
  );
}
