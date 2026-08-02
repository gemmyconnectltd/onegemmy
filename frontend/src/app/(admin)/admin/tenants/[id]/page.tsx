"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Users, ShoppingCart, TrendingUp, Package, UserPlus, Loader2, CheckCircle, XCircle, PauseCircle, PlayCircle } from "lucide-react";
import { adminApi, type AdminTenant, type AdminTenantStats, type AdminUser } from "@/lib/api/admin";
import { fmtMoney } from "@/lib/config";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import Link from "next/link";

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [tenant, setTenant] = useState<AdminTenant | null>(null);
  const [stats, setStats] = useState<AdminTenantStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", full_name: "", role: "member", password: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, s, u] = await Promise.all([
        adminApi.getTenant(id),
        adminApi.tenantStats(id),
        adminApi.tenantUsers(id),
      ]);
      setTenant(t.data);
      setStats(s.data);
      setUsers(u.data.items);
    } catch {
      setError("Failed to load tenant");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const toggleStatus = async () => {
    if (!tenant) return;
    setActing(true);
    try {
      if (tenant.is_active) await adminApi.suspendTenant(id);
      else await adminApi.activateTenant(id);
      await load();
    } catch { setError("Failed to update status"); }
    finally { setActing(false); }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      await adminApi.inviteUser(id, form);
      setShowInvite(false);
      setForm({ email: "", full_name: "", role: "member", password: "" });
      await load();
    } catch (err: unknown) {
      setNotice((err as { detail?: string })?.detail ?? "Failed to invite user");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={22} className="animate-spin text-violet-400" />
    </div>
  );

  if (error || !tenant) return (
    <div className="space-y-4">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors">
        <ArrowLeft size={14} /> Back
      </button>
      <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error ?? "Tenant not found"}</div>
    </div>
  );

  const statCards = stats ? [
    { label: "Users",            value: stats.users,                          icon: Users,        color: "#8b5cf6" },
    { label: "Total Orders",     value: stats.orders,                         icon: ShoppingCart, color: "#3b82f6" },
    { label: "Completed Orders", value: stats.completed_orders,               icon: CheckCircle,  color: "#10b981" },
    { label: "Products",         value: stats.products,                       icon: Package,      color: "#f59e0b" },
    { label: "Revenue",          value: fmtMoney(stats.revenue), isStr: true, icon: TrendingUp,   color: "#10b981" },
  ] : [];

  const PLAN_COLORS: Record<string, string> = {
    free: "text-white/50", starter: "text-blue-300", professional: "text-violet-300", enterprise: "text-amber-300",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/tenants" className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-white/50 hover:text-white hover:bg-white/10 transition-colors">
            <ArrowLeft size={15} />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-white">{tenant.name}</h1>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md capitalize ${tenant.is_active ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
                {tenant.is_active ? "Active" : "Suspended"}
              </span>
              <span className={`text-[11px] font-semibold capitalize ${PLAN_COLORS[tenant.subscription_plan] ?? "text-white/50"}`}>
                {tenant.subscription_plan}
              </span>
            </div>
            <p className="text-sm text-white/40 mt-0.5 font-mono">{tenant.slug} {tenant.city && `· ${tenant.city}`} {tenant.country && `· ${tenant.country}`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
          >
            <UserPlus size={14} /> Invite User
          </button>
          <button
            onClick={toggleStatus}
            disabled={acting}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
              tenant.is_active
                ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                : "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
            }`}
          >
            {acting ? <Loader2 size={14} className="animate-spin" /> : tenant.is_active ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
            {tenant.is_active ? "Suspend" : "Activate"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {statCards.map((c) => (
          <div key={c.label} className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2.5" style={{ backgroundColor: `${c.color}20` }}>
              <c.icon size={14} style={{ color: c.color }} />
            </div>
            <p className="text-lg font-bold text-white">{c.isStr ? c.value : Number(c.value).toLocaleString()}</p>
            <p className="text-[11px] text-white/40 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Users table */}
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Users ({users.length})</h2>
          <button onClick={() => setShowInvite(true)} className="flex items-center gap-1.5 text-[12px] font-semibold text-violet-400 hover:text-violet-300 transition-colors">
            <UserPlus size={13} /> Invite
          </button>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5 text-left text-[11px] text-white/40 uppercase tracking-wider">
              <th className="px-5 py-3 font-semibold">User</th>
              <th className="px-5 py-3 font-semibold">Role</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-white/5 transition-colors">
                <td className="px-5 py-3.5">
                  <p className="text-sm font-medium text-white">{u.full_name}</p>
                  <p className="text-[11px] text-white/40">{u.email}</p>
                </td>
                <td className="px-5 py-3.5">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white/10 text-white/60 capitalize">{u.role}</span>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`flex items-center gap-1 text-[11px] font-semibold w-fit ${u.is_active ? "text-emerald-400" : "text-red-400"}`}>
                    {u.is_active ? <CheckCircle size={11} /> : <XCircle size={11} />}
                    {u.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-[12px] text-white/40">
                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="py-12 text-center">
            <Users size={28} className="text-white/10 mx-auto mb-2" />
            <p className="text-sm text-white/30">No users yet</p>
          </div>
        )}
      </div>

      {/* Invite drawer */}
      <Drawer open={showInvite} onClose={() => setShowInvite(false)} title="Invite User" description={`Add a user to ${tenant.name}`}>
        <form onSubmit={handleInvite} className="space-y-4 p-5">
          {notice && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{notice}</p>}
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
          <FormFooter submitLabel={saving ? "Inviting…" : "Invite User"} onCancel={() => setShowInvite(false)} disabled={saving} />
        </form>
      </Drawer>
    </div>
  );
}
