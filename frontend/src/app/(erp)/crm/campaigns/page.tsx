"use client";
import { useState } from "react";
import { Megaphone, Plus, Send, MousePointerClick, Layers, Edit2, Trash2, AlertCircle, Loader2, Calendar } from "lucide-react";
import { useCampaigns, useCreateCampaign, useUpdateCampaign, useDeleteCampaign } from "@/lib/api/hooks";
import type { ApiCampaign } from "@/lib/api/crm";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";

const COLOR = "#0f766e";

const TYPE_OPTS = ["Email", "SMS", "WhatsApp"];
const STATUS_OPTS = ["Draft", "Active", "Completed", "Cancelled"];

const statusBadge: Record<string, string> = {
  Active: "bg-emerald-100 text-emerald-700",
  Draft: "bg-surface text-muted border border-border",
  Completed: "bg-blue-100 text-blue-700",
  Cancelled: "bg-red-100 text-red-600",
};

const EMPTY_FORM = { name: "", type: "Email", status: "Draft", start_date: "", target_count: 0 };
type FormState = typeof EMPTY_FORM;

export default function CampaignsPage() {
  const [error, setError] = useState<string | null>(null);
  const [shownLoadError, setShownLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState("All");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<ApiCampaign | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const campaignsQ = useCampaigns(1, 500);
  const loading = campaignsQ.isLoading;
  const campaigns = campaignsQ.data?.items ?? [];

  const loadError = campaignsQ.error;
  const loadErrorMessage = loadError ? (loadError as { detail?: string })?.detail ?? "Failed to load campaigns" : null;
  if (loadErrorMessage !== shownLoadError) {
    setShownLoadError(loadErrorMessage);
    if (loadErrorMessage !== null) setError(loadErrorMessage);
  }

  const createCampaign = useCreateCampaign();
  const updateCampaign = useUpdateCampaign();
  const deleteCampaign = useDeleteCampaign();
  const saving = createCampaign.isPending || updateCampaign.isPending;

  const totalSent = campaigns.reduce((s, c) => s + c.sent_count, 0);
  const totalOpened = campaigns.reduce((s, c) => s + c.opened_count, 0);
  const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;

  const stats = [
    { label: "Total Campaigns", value: campaigns.length, icon: Megaphone, color: COLOR },
    { label: "Active", value: campaigns.filter((c) => c.status === "Active").length, icon: Layers, color: "#10b981" },
    { label: "Emails Sent", value: totalSent, icon: Send, color: "#0284c7" },
    { label: "Open Rate", value: `${openRate}%`, icon: MousePointerClick, color: "#b45309" },
  ];

  const displayed = campaigns.filter((c) => filter === "All" || c.status === filter);

  const openAdd = () => { setForm(EMPTY_FORM); setFormError(null); setShowAdd(true); };
  const openEdit = (c: ApiCampaign) => {
    setEditing(c);
    setForm({
      name: c.name, type: c.type, status: c.status,
      start_date: c.start_date ?? "", target_count: c.target_count,
    });
    setFormError(null);
  };
  const closeDrawer = () => { setShowAdd(false); setEditing(null); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      type: form.type,
      status: form.status,
      start_date: form.start_date || null,
      target_count: form.target_count,
    };
    const onError = (err: Error) => setFormError((err as { detail?: string })?.detail ?? "Failed to save campaign");
    const onSuccess = () => { setError(null); closeDrawer(); };
    if (editing) {
      updateCampaign.mutate({ id: editing.id, data: payload }, { onSuccess, onError });
    } else {
      createCampaign.mutate(payload, { onSuccess, onError });
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this campaign?")) return;
    deleteCampaign.mutate(id, {
      onError: (err: Error) => setError((err as { detail?: string })?.detail ?? "Failed to delete campaign"),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted mt-0.5">{loading ? "Loading..." : `${campaigns.length} campaigns`}</p>
        </div>
        <Button color={COLOR} onClick={openAdd}><Plus size={15} /> New Campaign</Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} /> {error}
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <div className="w-8 h-8 flex items-center justify-center rounded-xl mb-2" style={{ backgroundColor: `${s.color}15` }}>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <p className="text-xl font-extrabold text-foreground tracking-tight">{loading ? "—" : s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1 w-fit">
        {["All", ...STATUS_OPTS].map((t) => (
          <button key={t} onClick={() => setFilter(t)}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors ${filter === t ? "text-white" : "text-foreground/50 hover:text-foreground"}`}
            style={filter === t ? { backgroundColor: COLOR } : undefined}>
            {t}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-20 flex items-center justify-center gap-2 text-muted">
            <Loader2 size={18} className="animate-spin" /> Loading campaigns...
          </div>
        ) : displayed.length === 0 ? (
          <div className="py-20 text-center">
            <Megaphone size={32} className="text-border mx-auto mb-3" />
            <p className="text-sm font-semibold text-muted">No campaigns yet</p>
            <p className="text-xs text-muted mt-1 mb-4">Create your first campaign to track reach and opens</p>
            <Button color={COLOR} size="sm" onClick={openAdd}><Plus size={13} /> New Campaign</Button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Campaign</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Type</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Start</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide text-right">Target</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide text-right">Sent</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide text-right">Opened</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayed.map((c) => (
                <tr key={c.id} className="hover:bg-surface/50 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Megaphone size={14} style={{ color: COLOR }} />
                      <span className="text-sm font-semibold text-foreground">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">{c.type}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted">
                      <Calendar size={12} /> {c.start_date ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-muted tabular-nums">{c.target_count.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums">{c.sent_count.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums">
                    {c.opened_count.toLocaleString()}
                    {c.sent_count > 0 && <span className="text-muted text-xs"> ({Math.round((c.opened_count / c.sent_count) * 100)}%)</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full ${statusBadge[c.status] ?? "bg-surface text-muted"}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
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
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Drawer open={showAdd || !!editing} onClose={closeDrawer}
        title={editing ? "Edit Campaign" : "New Campaign"}
        description={editing ? editing.name : "Set up a marketing campaign"}
        size="sm">
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <Field label="Campaign Name" required>
            <Input autoFocus value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. July Promo" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                {TYPE_OPTS.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                {STATUS_OPTS.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date">
              <Input type="date" value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
            </Field>
            <Field label="Target Recipients">
              <Input type="number" min={0} value={form.target_count}
                onChange={(e) => setForm((f) => ({ ...f, target_count: Number(e.target.value) || 0 }))} />
            </Field>
          </div>

          {formError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
          )}

          <FormFooter
            submitLabel={saving ? "Saving..." : editing ? "Save Changes" : "Create Campaign"}
            onCancel={closeDrawer}
            disabled={saving || !form.name.trim()}
            color={COLOR}
          />
        </form>
      </Drawer>
    </div>
  );
}
