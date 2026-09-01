"use client";
import { fmtMoney } from "@/lib/config";
import { Plus, Search, TrendingUp, ShoppingCart, Target, ArrowUpRight, Users, Edit2, Trash2, AlertCircle } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { useState } from "react";
import { useAppConfig } from "@/lib/appConfig";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter, Textarea } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { useDeals, useCreateDeal, useUpdateDeal, useDeleteDeal } from "@/lib/api/hooks";
import type { ApiDeal } from "@/lib/api";

const STAGES = ["Leads", "Qualified", "Proposal", "Negotiation", "Closed Won", "Closed Lost"];

const STAGE_STYLE: Record<string, string> = {
  Leads: "bg-slate-100 text-slate-600", Qualified: "bg-blue-100 text-blue-700",
  Proposal: "bg-amber-100 text-amber-700", Negotiation: "bg-orange-100 text-orange-700",
  "Closed Won": "bg-emerald-100 text-emerald-700", "Closed Lost": "bg-red-100 text-red-600",
};
const STAGE_BAR: Record<string, string> = {
  Leads: "bg-slate-400", Qualified: "bg-blue-500", Proposal: "bg-amber-400",
  Negotiation: "bg-orange-400", "Closed Won": "bg-emerald-500", "Closed Lost": "bg-red-400",
};
const STAGE_COLOR: Record<string, string> = {
  Leads: "#94a3b8", Qualified: "#3b82f6", Proposal: "#af9164",
  Negotiation: "#f59e0b", "Closed Won": "#10b981", "Closed Lost": "#ef4444",
};

const EMPTY_FORM = { name: "", value: "", stage: "Leads", probability: "50", expected_close_date: "", notes: "" };

export default function SalesPage() {
  const { currencySymbol, brandColor } = useAppConfig();
  const SAL = brandColor;
  const fmt = (v: number) => fmtMoney(v, currencySymbol);

  const [error, setError] = useState<string | null>(null);
  const [shownLoadError, setShownLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("All");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<ApiDeal | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data, isLoading, error: loadError } = useDeals(1, 200);
  const deals = data?.items ?? [];

  const loadErrorMessage = loadError ? (loadError as { detail?: string })?.detail ?? "Failed to load deals" : null;
  if (loadErrorMessage !== shownLoadError) {
    setShownLoadError(loadErrorMessage);
    if (loadErrorMessage !== null) setError(loadErrorMessage);
  }

  const createDeal = useCreateDeal();
  const updateDeal = useUpdateDeal();
  const deleteDeal = useDeleteDeal();
  const saving = createDeal.isPending || updateDeal.isPending;

  const revenue = deals.reduce((s, d) => s + (d.stage === "Closed Won" ? d.value : 0), 0);
  const closedWon = deals.filter((d) => d.stage === "Closed Won").length;
  const pipeline = deals.filter((d) => !["Closed Won", "Closed Lost"].includes(d.stage)).reduce((s, d) => s + d.value, 0);

  const stats = [
    { label: "Total Deals",    value: String(deals.length), icon: ShoppingCart, color: SAL },
    { label: "Revenue",        value: fmt(revenue),         icon: TrendingUp,   color: "#10b981", change: true },
    { label: "Closed Won",     value: String(closedWon),    icon: Target,       color: "#10b981" },
    { label: "Pipeline Value", value: fmt(pipeline),        icon: ArrowUpRight, color: "#af9164" },
  ];

  const stageCards = STAGES.slice(0, 5).map((s) => ({
    name: s, count: deals.filter((d) => d.stage === s).length,
    value: deals.filter((d) => d.stage === s).reduce((t, d) => t + d.value, 0),
    color: STAGE_COLOR[s],
  }));

  const filtered = deals.filter((d) => {
    const q = search.toLowerCase();
    const matchSearch = d.name.toLowerCase().includes(q) || (d.customer?.name ?? "").toLowerCase().includes(q);
    const matchStage = stageFilter === "All" || d.stage === stageFilter;
    return matchSearch && matchStage;
  });

  const openAdd = () => { setForm(EMPTY_FORM); setShowAdd(true); };
  const openEdit = (d: ApiDeal) => {
    setEditing(d);
    setForm({ name: d.name, value: String(d.value), stage: d.stage, probability: String(d.probability), expected_close_date: d.expected_close_date ?? "", notes: d.notes ?? "" });
  };
  const closeDrawer = () => { setShowAdd(false); setEditing(null); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.value) return;
    const payload = { name: form.name, value: Number(form.value), stage: form.stage, probability: Number(form.probability), expected_close_date: form.expected_close_date || null, notes: form.notes || null };
    const onError = (err: Error) => setError((err as { detail?: string })?.detail ?? "Failed to save deal");
    const onSuccess = () => { setError(null); closeDrawer(); };
    if (editing) {
      updateDeal.mutate({ id: editing.id, data: payload }, { onSuccess, onError });
    } else {
      createDeal.mutate(payload, { onSuccess, onError });
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this deal?")) return;
    deleteDeal.mutate(id, { onError: (err: Error) => setError((err as { detail?: string })?.detail ?? "Failed to delete deal") });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Sales Pipeline</h1>
          <p className="text-sm text-muted mt-0.5">{deals.length} deals across all stages</p>
        </div>
        <Button color={SAL} onClick={openAdd}><Plus size={15} /> New Deal</Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} /> {error}
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 flex items-center justify-center" style={{ backgroundColor: `${s.color}10` }}>
                <s.icon size={16} style={{ color: s.color }} />
              </div>
              {s.change && <span className="flex items-center gap-0.5 text-[11px] font-semibold text-emerald-600"><ArrowUpRight size={11} />live</span>}
            </div>
            <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">{isLoading ? "—" : s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {stageCards.map((s) => (
          <button key={s.name} onClick={() => setStageFilter(stageFilter === s.name ? "All" : s.name)}
            className={`bg-card border rounded-xl p-4 hover:shadow-md transition-all text-left ${stageFilter === s.name ? "border-foreground/20 shadow-sm" : "border-border"}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="text-xs font-semibold text-muted bg-surface px-2 py-0.5 rounded-full">{s.count}</span>
            </div>
            <p className="text-sm font-bold text-foreground">{s.name}</p>
            <p className="text-xs text-muted mt-0.5">{fmt(s.value)}</p>
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Users size={15} style={{ color: SAL }} /> Deals
            {stageFilter !== "All" && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: SAL }}>{stageFilter}</span>
            )}
          </div>
          <div className="ml-auto relative w-56">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search deals..."
              className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none bg-transparent" />
          </div>
        </div>

        {isLoading ? (
          <PageLoader variant="compact" />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-border">
                <th className="p-4 font-semibold">Deal Name</th>
                <th className="p-4 font-semibold">Customer</th>
                <th className="p-4 font-semibold">Value</th>
                <th className="p-4 font-semibold">Stage</th>
                <th className="p-4 font-semibold">Probability</th>
                <th className="p-4 font-semibold">Close Date</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((deal) => (
                <tr key={deal.id} className="hover:bg-surface/50 transition-colors group">
                  <td className="p-4 text-sm font-medium text-foreground max-w-[200px] truncate">{deal.name}</td>
                  <td className="p-4 text-sm text-muted">{deal.customer?.name ?? <span className="italic text-muted/50">—</span>}</td>
                  <td className="p-4 text-sm font-bold text-foreground tabular-nums">{fmt(deal.value)}</td>
                  <td className="p-4">
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${STAGE_STYLE[deal.stage] ?? "bg-slate-100 text-slate-600"}`}>{deal.stage}</span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-surface rounded-full h-1.5 overflow-hidden">
                        <div className={`h-full rounded-full ${STAGE_BAR[deal.stage] ?? "bg-slate-400"}`} style={{ width: `${deal.probability}%` }} />
                      </div>
                      <span className="text-xs text-muted tabular-nums">{deal.probability}%</span>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-muted">{deal.expected_close_date ?? "—"}</td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => openEdit(deal)} aria-label="Edit deal" className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors text-[12px] font-semibold disabled:opacity-50"><Edit2 size={13} /> Edit</button>
                      <button onClick={() => handleDelete(deal.id)} aria-label="Delete deal" className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold disabled:opacity-50"><Trash2 size={13} /> Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="py-16 text-center">
            <Users size={32} className="text-border mx-auto mb-3" />
            <p className="text-sm font-semibold text-muted">No deals found</p>
            <p className="text-xs text-muted mt-1">Add your first deal to get started</p>
          </div>
        )}
      </div>

      <Drawer open={showAdd || !!editing} onClose={closeDrawer} title={editing ? "Edit Deal" : "New Deal"} description={editing ? editing.name : "Add a new deal to the pipeline"} size="md">
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <Field label="Deal Name" required>
            <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Enterprise License - Acme Corp" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Value" required>
              <Input type="number" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="0" />
            </Field>
            <Field label="Probability (%)">
              <Input type="number" min="0" max="100" value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value })} placeholder="50" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stage">
              <Select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
                {STAGES.map((s) => <option key={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Expected Close Date">
              <Input type="date" value={form.expected_close_date} onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any additional notes..." />
          </Field>
          <FormFooter submitLabel={saving ? "Saving..." : editing ? "Save Changes" : "Add Deal"} onCancel={closeDrawer} disabled={!form.name || !form.value || saving} color={SAL} />
        </form>
      </Drawer>
    </div>
  );
}
