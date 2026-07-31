"use client";
import { fmtMoney } from "@/lib/config";
import {
  Target, Plus, TrendingUp, CheckCircle2, AlertTriangle, XCircle,
  Edit2, Trash2, Loader2, AlertCircle, Zap, Calendar,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useAppConfig } from "@/lib/appConfig";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { salesApi, type ApiTarget } from "@/lib/api";

const SAL = "#0284c7";

// ── Metric type presets — makes the form self-explanatory ─────────────────────
const METRIC_TYPES = [
  { value: "revenue",   label: "Revenue",       unit: "currency", placeholder: "e.g. 5,000,000" },
  { value: "orders",    label: "Orders Closed", unit: "number",   placeholder: "e.g. 200" },
  { value: "customers", label: "New Customers", unit: "number",   placeholder: "e.g. 50" },
  { value: "deals",     label: "Deals Won",     unit: "number",   placeholder: "e.g. 30" },
  { value: "avg_order", label: "Avg Order Size", unit: "currency", placeholder: "e.g. 100,000" },
  { value: "custom",    label: "Custom",        unit: "number",   placeholder: "e.g. 100" },
] as const;

// ── Period helpers ────────────────────────────────────────────────────────────
function buildPeriodOptions() {
  const now = new Date();
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const options: { label: string; value: string }[] = [];

  // current + next 5 months
  for (let i = -1; i <= 5; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    options.push({ label: `${months[d.getMonth()]} ${d.getFullYear()}`, value: `${months[d.getMonth()]} ${d.getFullYear()}` });
  }
  // quarters
  const q = Math.floor(now.getMonth() / 3) + 1;
  for (let i = 0; i <= 1; i++) {
    const qn = ((q - 1 + i) % 4) + 1;
    const yr = now.getFullYear() + (q + i > 4 ? 1 : 0);
    options.push({ label: `Q${qn} ${yr}`, value: `Q${qn} ${yr}` });
  }
  // full year
  options.push({ label: String(now.getFullYear()), value: String(now.getFullYear()) });
  options.push({ label: String(now.getFullYear() + 1), value: String(now.getFullYear() + 1) });

  return options;
}

const PERIOD_OPTIONS = buildPeriodOptions();

const EMPTY_FORM = {
  metricType: "revenue",
  name: "",
  target_value: "",
  achieved_value: "",
  period: PERIOD_OPTIONS[1].value, // current month
  unit: "currency" as "currency" | "number",
  assigned_to: "",
};

type FormState = typeof EMPTY_FORM;

// ── Progress quick-update drawer ──────────────────────────────────────────────
function QuickUpdateDrawer({
  target, onClose, onSaved, currencySymbol,
}: {
  target: ApiTarget;
  onClose: () => void;
  onSaved: () => void;
  currencySymbol: string;
}) {
  const fmt = (v: number) => target.unit === "currency" ? fmtMoney(v, currencySymbol) : v.toLocaleString();
  const [value, setValue] = useState(String(target.achieved_value));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pct = target.target_value > 0 ? Math.min(100, Math.round((Number(value) / target.target_value) * 100)) : 0;
  const barColor = pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-400" : "bg-red-400";

  const save = async () => {
    setSaving(true);
    try {
      await salesApi.updateTarget(target.id, { achieved_value: Number(value) });
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError((e as { detail?: string })?.detail ?? "Failed to update");
    } finally { setSaving(false); }
  };

  return (
    <div className="p-5 space-y-5">
      <div className="bg-surface rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-foreground">{target.name}</p>
          <span className="text-[11px] text-muted bg-card border border-border px-2 py-0.5 rounded-full">{target.period}</span>
        </div>
        <div>
          <div className="flex items-end justify-between mb-1.5">
            <p className="text-2xl font-extrabold text-foreground">{pct}%</p>
            <p className="text-[12px] text-muted">
              {fmt(Number(value))} <span className="text-muted/50">/ {fmt(target.target_value)}</span>
            </p>
          </div>
          <div className="h-2.5 bg-border rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <Field label="Current Achieved Value" required>
        <Input
          autoFocus
          type="number"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0"
        />
      </Field>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <FormFooter
        submitLabel={saving ? "Saving..." : "Update Progress"}
        onCancel={onClose}
        disabled={saving || value === ""}
        color={SAL}
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SalesTargetsPage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number, unit: string) =>
    unit === "currency" ? fmtMoney(v, currencySymbol) : v.toLocaleString();

  const [targets, setTargets] = useState<ApiTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<ApiTarget | null>(null);
  const [quickUpdate, setQuickUpdate] = useState<ApiTarget | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [periodFilter, setPeriodFilter] = useState("All");

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const res = await salesApi.listTargets(1, 200);
      setTargets(res.data.items);
    } catch (e: unknown) {
      setError((e as { detail?: string })?.detail ?? "Failed to load targets");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // unique periods from data for filter tabs
  const periods = useMemo(() => {
    const set = new Set(targets.map((t) => t.period));
    return ["All", ...Array.from(set).sort()];
  }, [targets]);

  const displayed = periodFilter === "All" ? targets : targets.filter((t) => t.period === periodFilter);

  const achieved = targets.filter((t) => t.target_value > 0 && t.achieved_value / t.target_value >= 1).length;
  const onTrack  = targets.filter((t) => { const p = t.target_value > 0 ? t.achieved_value / t.target_value : 0; return p >= 0.6 && p < 1; }).length;
  const behind   = targets.filter((t) => t.target_value > 0 && t.achieved_value / t.target_value < 0.6).length;

  const summaryStats = [
    { label: "Total Targets", value: String(targets.length), icon: Target,        color: SAL },
    { label: "Achieved",      value: String(achieved),       icon: CheckCircle2,  color: "#10b981" },
    { label: "On Track",      value: String(onTrack),        icon: TrendingUp,    color: "#f59e0b" },
    { label: "Behind",        value: String(behind),         icon: AlertTriangle, color: "#ef4444" },
  ];

  // ── form helpers ─────────────────────────────────────────────────────────────
  const setMetricType = (val: string) => {
    const preset = METRIC_TYPES.find((m) => m.value === val);
    if (!preset) return;
    setForm((f) => ({
      ...f,
      metricType: val,
      unit: preset.unit as "currency" | "number",
      name: preset.value === "custom" ? f.name : preset.label,
    }));
  };

  const openAdd = () => { setForm(EMPTY_FORM); setShowAdd(true); };
  const openEdit = (t: ApiTarget) => {
    setEditing(t);
    setForm({
      metricType: "custom",
      name: t.name,
      target_value: String(t.target_value),
      achieved_value: String(t.achieved_value),
      period: t.period,
      unit: t.unit as "currency" | "number",
      assigned_to: t.assigned_to ?? "",
    });
  };
  const closeDrawer = () => { setShowAdd(false); setEditing(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.target_value || !form.period) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        target_value: Number(form.target_value),
        achieved_value: Number(form.achieved_value) || 0,
        period: form.period,
        unit: form.unit,
        assigned_to: form.assigned_to || null,
      };
      if (editing) {
        await salesApi.updateTarget(editing.id, payload);
      } else {
        await salesApi.createTarget(payload);
      }
      closeDrawer();
      await load();
    } catch (e: unknown) {
      setError((e as { detail?: string })?.detail ?? "Failed to save target");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this target?")) return;
    try {
      await salesApi.deleteTarget(id);
      setTargets((prev) => prev.filter((t) => t.id !== id));
    } catch (e: unknown) {
      setError((e as { detail?: string })?.detail ?? "Failed to delete target");
    }
  };

  // live preview pct in form
  const previewPct = form.target_value
    ? Math.min(100, Math.round(((Number(form.achieved_value) || 0) / Number(form.target_value)) * 100))
    : 0;

  const selectedPreset = METRIC_TYPES.find((m) => m.value === form.metricType);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Sales Targets</h1>
          <p className="text-sm text-muted mt-0.5">Monitor progress against your goals</p>
        </div>
        <Button color={SAL} onClick={openAdd}><Plus size={15} /> Add Target</Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} /> {error}
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryStats.map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 hover:shadow-md hover:border-foreground/15 transition-all">
            <div className="w-8 h-8 flex items-center justify-center rounded-xl mb-2" style={{ backgroundColor: `${s.color}15` }}>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">{loading ? "—" : s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Period filter tabs ── */}
      {periods.length > 2 && (
        <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1 w-fit flex-wrap">
          {periods.map((p) => (
            <button key={p} onClick={() => setPeriodFilter(p)}
              className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors whitespace-nowrap ${periodFilter === p ? "text-white" : "text-foreground/50 hover:text-foreground"}`}
              style={periodFilter === p ? { backgroundColor: SAL } : undefined}>
              {p}
            </button>
          ))}
        </div>
      )}

      {/* ── Cards ── */}
      {loading ? (
        <div className="py-20 flex items-center justify-center gap-2 text-muted">
          <Loader2 size={18} className="animate-spin" /> Loading targets...
        </div>
      ) : displayed.length === 0 ? (
        <div className="py-20 text-center bg-card border border-border rounded-xl">
          <Target size={32} className="text-border mx-auto mb-3" />
          <p className="text-sm font-semibold text-muted">No targets yet</p>
          <p className="text-xs text-muted mt-1 mb-4">Set goals to track your team's progress</p>
          <Button color={SAL} size="sm" onClick={openAdd}><Plus size={13} /> Add First Target</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {displayed.map((t) => {
            const pct = t.target_value > 0 ? Math.min(100, Math.round((t.achieved_value / t.target_value) * 100)) : 0;
            const isAchieved = pct >= 100;
            const isOnTrack  = pct >= 60 && pct < 100;
            const barColor   = isAchieved ? "bg-emerald-500" : isOnTrack ? "bg-amber-400" : "bg-red-400";
            const badge = isAchieved
              ? { label: "Achieved", cls: "bg-emerald-100 text-emerald-700", Icon: CheckCircle2 }
              : isOnTrack
              ? { label: "On Track", cls: "bg-amber-100 text-amber-700",    Icon: TrendingUp }
              : { label: "Behind",   cls: "bg-red-100 text-red-600",        Icon: XCircle };

            return (
              <div key={t.id} className="bg-card border border-border rounded-xl p-5 hover:shadow-md hover:border-foreground/15 transition-all space-y-4 group">
                {/* top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0" style={{ backgroundColor: `${SAL}15` }}>
                      <Target size={16} style={{ color: SAL }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{t.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-1 text-[11px] text-muted">
                          <Calendar size={10} /> {t.period}
                        </span>
                        {t.unit === "currency" && (
                          <span className="text-[10px] text-muted bg-surface border border-border px-1.5 py-0.5 rounded-full">Currency</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}>
                      <badge.Icon size={11} /> {badge.label}
                    </span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-0.5">
                      <button onClick={() => openEdit(t)} className="w-7 h-7 flex items-center justify-center text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors"><Edit2 size={13} /></button>
                      <button onClick={() => handleDelete(t.id)} className="w-7 h-7 flex items-center justify-center text-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={13} /></button>
                    </div>
                  </div>
                </div>

                {/* progress */}
                <div>
                  <div className="flex items-end justify-between mb-2">
                    <p className="text-2xl font-extrabold text-foreground">{pct}%</p>
                    <div className="text-right">
                      <p className="text-[13px] font-bold text-foreground tabular-nums">{fmt(t.achieved_value, t.unit)}</p>
                      <p className="text-[11px] text-muted">of {fmt(t.target_value, t.unit)}</p>
                    </div>
                  </div>
                  <div className="h-2.5 bg-surface rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                  {/* remaining */}
                  {!isAchieved && t.target_value > t.achieved_value && (
                    <p className="text-[11px] text-muted mt-1.5">
                      {fmt(t.target_value - t.achieved_value, t.unit)} remaining
                    </p>
                  )}
                </div>

                {/* quick update button */}
                <button
                  onClick={() => setQuickUpdate(t)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border text-[12px] font-semibold text-muted hover:text-foreground hover:bg-surface transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Zap size={12} /> Update Progress
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit Drawer ── */}
      <Drawer
        open={showAdd || !!editing}
        onClose={closeDrawer}
        title={editing ? "Edit Target" : "New Target"}
        description={editing ? editing.name : "Define a measurable sales goal"}
        size="md"
      >
        <form onSubmit={handleSubmit} className="p-5 space-y-5">

          {/* metric type picker — only on create */}
          {!editing && (
            <div>
              <label className="block text-[12px] font-semibold text-muted mb-2">Metric Type</label>
              <div className="grid grid-cols-3 gap-2">
                {METRIC_TYPES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMetricType(m.value)}
                    className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border text-center transition-all ${
                      form.metricType === m.value
                        ? "border-transparent text-white"
                        : "border-border text-foreground/60 hover:border-foreground/20 hover:text-foreground"
                    }`}
                    style={form.metricType === m.value ? { backgroundColor: SAL } : undefined}
                  >
                    <span className="text-[11px] font-semibold leading-tight">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* name — auto-filled from preset, editable */}
          <Field label="Target Name" required>
            <Input
              autoFocus={!!editing}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={selectedPreset?.value === "custom" ? "e.g. Upsell Conversions" : selectedPreset?.label ?? "Target name"}
            />
          </Field>

          {/* target + achieved side by side */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target Value" required>
              <Input
                type="number" min="0"
                value={form.target_value}
                onChange={(e) => setForm((f) => ({ ...f, target_value: e.target.value }))}
                placeholder={selectedPreset?.placeholder ?? "0"}
              />
            </Field>
            <Field label="Achieved So Far">
              <Input
                type="number" min="0"
                value={form.achieved_value}
                onChange={(e) => setForm((f) => ({ ...f, achieved_value: e.target.value }))}
                placeholder="0"
              />
            </Field>
          </div>

          {/* live preview bar */}
          {form.target_value && (
            <div className="bg-surface rounded-xl px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-muted">Preview</span>
                <span className="text-[12px] font-bold text-foreground">{previewPct}%</span>
              </div>
              <div className="h-2 bg-border rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${previewPct >= 100 ? "bg-emerald-500" : previewPct >= 60 ? "bg-amber-400" : "bg-red-400"}`}
                  style={{ width: `${previewPct}%` }}
                />
              </div>
              <p className="text-[11px] text-muted">
                {fmt(Number(form.achieved_value) || 0, form.unit)}
                <span className="text-muted/50"> / {fmt(Number(form.target_value), form.unit)}</span>
              </p>
            </div>
          )}

          {/* period + unit */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Period" required>
              <Select
                value={form.period}
                onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
              >
                {PERIOD_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
                {/* if editing and period not in list, add it */}
                {editing && !PERIOD_OPTIONS.find((p) => p.value === form.period) && (
                  <option value={form.period}>{form.period}</option>
                )}
              </Select>
            </Field>
            <Field label="Unit">
              <Select value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value as "currency" | "number" }))}>
                <option value="currency">Currency ({currencySymbol})</option>
                <option value="number">Number (count)</option>
              </Select>
            </Field>
          </div>

          <FormFooter
            submitLabel={saving ? "Saving..." : editing ? "Save Changes" : "Add Target"}
            onCancel={closeDrawer}
            disabled={!form.name || !form.target_value || !form.period || saving}
            color={SAL}
          />
        </form>
      </Drawer>

      {/* ── Quick Update Drawer ── */}
      <Drawer
        open={!!quickUpdate}
        onClose={() => setQuickUpdate(null)}
        title="Update Progress"
        description={quickUpdate?.name}
        size="sm"
      >
        {quickUpdate && (
          <QuickUpdateDrawer
            target={quickUpdate}
            onClose={() => setQuickUpdate(null)}
            onSaved={load}
            currencySymbol={currencySymbol}
          />
        )}
      </Drawer>
    </div>
  );
}
