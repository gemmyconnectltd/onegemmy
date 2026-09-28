"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Building2, MapPin, Phone, Globe, Users, ArrowLeftRight,
  CheckCircle, XCircle, Pencil, UserCheck, UserX, ArrowUpRight, ArrowDownLeft,
} from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import { useAppConfig } from "@/lib/appConfig";
import { useMyBranch, useMyBranchStats, useUpdateMyBranch } from "@/lib/api/hooks";

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-violet-100 text-violet-700",
  member: "bg-blue-100 text-blue-700",
  viewer: "bg-surface text-muted",
};

const TRANSFER_STATUS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  in_transit: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-600",
};

export default function BranchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { brandColor } = useAppConfig();
  const C = brandColor;

  const { data: branch, isLoading: branchLoading } = useMyBranch(id);
  const { data: stats, isLoading: statsLoading } = useMyBranchStats(id);
  const updateBranch = useUpdateMyBranch();

  const [showEdit, setShowEdit] = useState(false);
  const [form, setForm] = useState({ name: "", location: "", phone: "", email: "", status: "active" });
  const [formError, setFormError] = useState<string | null>(null);

  const openEdit = () => {
    if (!branch) return;
    setForm({
      name: branch.name,
      location: branch.location ?? "",
      phone: branch.phone ?? "",
      email: branch.email ?? "",
      status: branch.status ?? "active",
    });
    setFormError(null);
    setShowEdit(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError("Branch name is required"); return; }
    setFormError(null);
    try {
      await updateBranch.mutateAsync({
        id,
        data: {
          name: form.name.trim(),
          location: form.location.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          status: form.status,
        },
      });
      setShowEdit(false);
    } catch (err) {
      setFormError((err as { detail?: string })?.detail ?? "Could not save branch");
    }
  };

  if (branchLoading) return <PageLoader />;
  if (!branch) return (
    <div className="space-y-4">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors">
        <ArrowLeft size={14} /> Back
      </button>
      <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">Branch not found.</p>
    </div>
  );

  const isActive = branch.status === "active";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface text-muted hover:text-foreground hover:bg-border transition-colors">
            <ArrowLeft size={15} />
          </button>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${C}15` }}>
            <Building2 size={18} style={{ color: C }} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[22px] font-bold text-foreground tracking-tight">{branch.name}</h1>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${isActive ? "bg-emerald-100 text-emerald-700" : "bg-surface text-muted border border-border"}`}>
                {isActive ? "Active" : "Inactive"}
              </span>
            </div>
            {branch.location && (
              <p className="text-sm text-muted mt-0.5 flex items-center gap-1.5">
                <MapPin size={12} /> {branch.location}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={openEdit}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-surface transition-colors"
        >
          <Pencil size={14} /> Edit Branch
        </button>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Users", value: String(stats?.user_count ?? branch.user_count ?? 0), icon: Users, color: C },
          { label: "Transfers", value: String(stats?.transfer_count ?? 0), icon: ArrowLeftRight, color: "#0284c7" },
          { label: "Phone", value: branch.phone ?? "—", icon: Phone, color: "#64748b" },
          { label: "Email", value: branch.email ?? "—", icon: Globe, color: "#64748b" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ backgroundColor: `${s.color}15` }}>
              <s.icon size={15} style={{ color: s.color }} />
            </div>
            <p className="text-lg font-extrabold text-foreground tracking-tight truncate" title={s.value}>{s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Users */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Assigned Users</h2>
            <span className="text-[11px] text-muted">{stats?.user_count ?? 0} total</span>
          </div>
          {statsLoading ? (
            <div className="py-10 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !stats?.users?.length ? (
            <div className="py-12 text-center">
              <Users size={28} className="text-border mx-auto mb-2" />
              <p className="text-sm text-muted">No users assigned to this branch</p>
              <p className="text-xs text-muted/70 mt-1">Assign users from Settings → Users</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {stats.users.map((u) => (
                <div key={u.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[13px] font-bold shrink-0" style={{ backgroundColor: C }}>
                      {u.full_name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{u.full_name}</p>
                      <p className="text-[11px] text-muted truncate">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${ROLE_COLORS[u.role] ?? "bg-surface text-muted"}`}>
                      {u.role}
                    </span>
                    {u.is_active
                      ? <UserCheck size={13} className="text-emerald-500" />
                      : <UserX size={13} className="text-muted" />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent transfers */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Recent Transfers</h2>
            <a href="/inventory/transfers" className="text-[12px] font-semibold text-accent hover:underline">View all</a>
          </div>
          {statsLoading ? (
            <div className="py-10 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !stats?.recent_transfers?.length ? (
            <div className="py-12 text-center">
              <ArrowLeftRight size={28} className="text-border mx-auto mb-2" />
              <p className="text-sm text-muted">No transfers yet for this branch</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {stats.recent_transfers.map((t) => (
                <div key={t.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${t.direction === "incoming" ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600"}`}>
                      {t.direction === "incoming"
                        ? <ArrowDownLeft size={13} />
                        : <ArrowUpRight size={13} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground font-mono">{t.transfer_number}</p>
                      <p className="text-[11px] text-muted capitalize">{t.direction} · {t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}</p>
                    </div>
                  </div>
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${TRANSFER_STATUS[t.status] ?? "bg-surface text-muted"}`}>
                    {t.status.replace("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit drawer */}
      <Drawer open={showEdit} onClose={() => setShowEdit(false)} title="Edit Branch" description={`Update ${branch.name}`} size="md">
        <form onSubmit={handleSave} className="p-5 space-y-4">
          <Field label="Branch Name" required>
            <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Downtown Store" />
          </Field>
          <Field label="Location">
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Kigali, Rwanda" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+250 7XX XXX XXX" />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="branch@company.com" />
            </Field>
          </div>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
          {formError && <p className="text-[12px] font-semibold text-red-600">{formError}</p>}
          <FormFooter
            submitLabel={updateBranch.isPending ? "Saving…" : "Save Changes"}
            onCancel={() => setShowEdit(false)}
            disabled={updateBranch.isPending || !form.name.trim()}
          />
        </form>
      </Drawer>
    </div>
  );
}
