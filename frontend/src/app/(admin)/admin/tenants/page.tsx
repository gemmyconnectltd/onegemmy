"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Building2, CheckCircle, XCircle, Trash2, Eye, PauseCircle, PlayCircle, Loader2 } from "lucide-react";
import { adminApi, type AdminTenant } from "@/lib/api/admin";
import Link from "next/link";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";

const PLAN_COLORS: Record<string, string> = {
  free: "bg-white/10 text-white/50",
  starter: "bg-blue-500/20 text-blue-300",
  professional: "bg-violet-500/20 text-violet-300",
  enterprise: "bg-amber-500/20 text-amber-300",
};

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", subscription_plan: "free", phone: "", city: "", country: "Rwanda" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listTenants(1, 100);
      setTenants(res.data.items);
    } catch {
      setError("Failed to load tenants");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      await adminApi.createTenant(form);
      setShowCreate(false);
      setForm({ name: "", slug: "", subscription_plan: "free", phone: "", city: "", country: "Rwanda" });
      await load();
    } catch (err: unknown) {
      setNotice((err as { detail?: string })?.detail ?? "Failed to create tenant");
    } finally {
      setSaving(false);
    }
  };

  const suspend = async (t: AdminTenant) => {
    setActing(t.id);
    try { await adminApi.suspendTenant(t.id); await load(); }
    catch { setError("Failed to suspend tenant"); }
    finally { setActing(null); }
  };

  const activate = async (t: AdminTenant) => {
    setActing(t.id);
    try { await adminApi.activateTenant(t.id); await load(); }
    catch { setError("Failed to activate tenant"); }
    finally { setActing(null); }
  };

  const remove = async (t: AdminTenant) => {
    if (!confirm(`Delete tenant "${t.name}"? This is irreversible.`)) return;
    setActing(t.id);
    try { await adminApi.deleteTenant(t.id); await load(); }
    catch { setError("Failed to delete tenant"); }
    finally { setActing(null); }
  };

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    setForm((f) => ({ ...f, name, slug }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Tenants</h1>
          <p className="text-sm text-white/40 mt-1">{tenants.length} registered businesses</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
        >
          <Plus size={15} /> New Tenant
        </button>
      </div>

      {error && (
        <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-white/40 hover:text-white text-xs">Dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 size={22} className="animate-spin text-violet-400" />
        </div>
      ) : (
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10 text-left text-[11px] text-white/40 uppercase tracking-wider">
                <th className="px-5 py-3 font-semibold">Business</th>
                <th className="px-5 py-3 font-semibold">Plan</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Created</th>
                <th className="px-5 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tenants.map((t) => (
                <tr key={t.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                        <Building2 size={14} className="text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{t.name}</p>
                        <p className="text-[11px] text-white/40 font-mono">{t.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-[11px] font-semibold px-2 py-1 rounded-md capitalize ${PLAN_COLORS[t.subscription_plan] ?? "bg-white/10 text-white/50"}`}>
                      {t.subscription_plan}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`flex items-center gap-1.5 text-[11px] font-semibold w-fit ${t.is_active ? "text-emerald-400" : "text-red-400"}`}>
                      {t.is_active ? <CheckCircle size={12} /> : <XCircle size={12} />}
                      {t.is_active ? "Active" : "Suspended"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-[12px] text-white/40">
                    {t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link
                        href={`/admin/tenants/${t.id}`}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <Eye size={13} />
                      </Link>
                      {t.is_active ? (
                        <button
                          onClick={() => suspend(t)}
                          disabled={acting === t.id}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-40"
                        >
                          {acting === t.id ? <Loader2 size={12} className="animate-spin" /> : <PauseCircle size={13} />}
                        </button>
                      ) : (
                        <button
                          onClick={() => activate(t)}
                          disabled={acting === t.id}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
                        >
                          {acting === t.id ? <Loader2 size={12} className="animate-spin" /> : <PlayCircle size={13} />}
                        </button>
                      )}
                      <button
                        onClick={() => remove(t)}
                        disabled={acting === t.id}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tenants.length === 0 && (
            <div className="py-16 text-center">
              <Building2 size={32} className="text-white/10 mx-auto mb-3" />
              <p className="text-sm text-white/30">No tenants yet</p>
            </div>
          )}
        </div>
      )}

      <Drawer open={showCreate} onClose={() => setShowCreate(false)} title="Onboard New Tenant" description="Create a new business on the platform">
        <form onSubmit={handleCreate} className="space-y-4 p-5">
          {notice && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{notice}</p>}
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
          <FormFooter submitLabel={saving ? "Creating…" : "Create Tenant"} onCancel={() => setShowCreate(false)} disabled={saving} />
        </form>
      </Drawer>
    </div>
  );
}
