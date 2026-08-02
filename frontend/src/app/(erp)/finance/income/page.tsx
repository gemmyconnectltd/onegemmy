"use client";

import { fmtMoney } from "@/lib/config";
import { useAppConfig } from "@/lib/appConfig";
import { useCallback, useEffect, useState } from "react";
import {
  TrendingUp, Plus, AlertCircle, Loader2, CheckCircle2,
  Clock, Ban, ArrowUpRight, RefreshCw, Filter,
} from "lucide-react";
import { financeApi, type FinanceTransaction } from "@/lib/api/finance";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";

const FIN = "#b45309";

const STATUS_STYLES: Record<string, { cls: string; Icon: typeof CheckCircle2 }> = {
  Posted: { cls: "bg-emerald-100 text-emerald-700", Icon: CheckCircle2 },
  Draft:  { cls: "bg-amber-100 text-amber-700",    Icon: Clock },
  Void:   { cls: "bg-red-100 text-red-500",         Icon: Ban },
};

function txnAmount(t: FinanceTransaction) {
  return t.lines.reduce((s, l) => s + (l.type === "credit" ? l.amount : 0), 0);
}

function txnSource(t: FinanceTransaction) {
  return t.lines.find((l) => l.type === "credit")?.account?.name ?? "Sales Revenue";
}

export default function IncomePage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);

  const [txns, setTxns] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("All");
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    description: "",
    amount: "",
    transaction_date: new Date().toISOString().slice(0, 10),
    type: "manual",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await financeApi.listTransactions("sale");
      // also fetch manual income entries
      const manualRes = await financeApi.listTransactions("manual");
      const all = [...res.data.items, ...manualRes.data.items].sort(
        (a, b) => new Date(b.transaction_date ?? 0).getTime() - new Date(a.transaction_date ?? 0).getTime()
      );
      setTxns(all);
    } catch {
      setError("Could not load income transactions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const displayed = statusFilter === "All" ? txns : txns.filter((t) => t.status === statusFilter);

  const totalPosted = txns.filter((t) => t.status === "Posted").reduce((s, t) => s + txnAmount(t), 0);
  const totalDraft  = txns.filter((t) => t.status === "Draft").reduce((s, t) => s + txnAmount(t), 0);
  const countPosted = txns.filter((t) => t.status === "Posted").length;
  const countDraft  = txns.filter((t) => t.status === "Draft").length;

  const stats = [
    { label: "Total Income",    value: fmt(totalPosted), sub: `${countPosted} posted`,       color: "#10b981", Icon: TrendingUp },
    { label: "Pending",         value: fmt(totalDraft),  sub: `${countDraft} draft entries`, color: "#f59e0b", Icon: Clock },
    { label: "All Entries",     value: String(txns.length), sub: "sale + manual",            color: FIN,       Icon: ArrowUpRight },
  ];

  const handlePost = async (id: string) => {
    try {
      await financeApi.postTransaction(id);
      await load();
    } catch (e: unknown) {
      setError((e as { detail?: string })?.detail ?? "Failed to post transaction");
    }
  };

  const handleVoid = async (id: string) => {
    if (!confirm("Void this transaction? This cannot be undone.")) return;
    try {
      await financeApi.voidTransaction(id);
      await load();
    } catch (e: unknown) {
      setError((e as { detail?: string })?.detail ?? "Failed to void transaction");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const amount = Number(form.amount);
    if (!form.description || !amount) return;
    setSaving(true);
    try {
      const accounts = await financeApi.listAccounts();
      const items = accounts.data.items;
      const cash = items.find((a) => a.type === "Assets" && /cash|bank/i.test(a.name)) ?? items.find((a) => a.type === "Assets");
      const revenue = items.find((a) => a.type === "Revenue" && /sales/i.test(a.name)) ?? items.find((a) => a.type === "Revenue");
      if (!cash || !revenue) {
        setFormError("No Asset or Revenue accounts found. Go to Finance → Accounts and seed defaults first.");
        setSaving(false);
        return;
      }
      await financeApi.createTransaction({
        type: "manual",
        transaction_date: form.transaction_date,
        description: form.description,
        lines: [
          { account_id: cash.id,    type: "debit",  amount },
          { account_id: revenue.id, type: "credit", amount },
        ],
      });
      setShowAdd(false);
      setForm({ description: "", amount: "", transaction_date: new Date().toISOString().slice(0, 10), type: "manual" });
      await load();
    } catch (e: unknown) {
      setFormError((e as { detail?: string })?.detail ?? "Could not save income entry.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Income</h1>
          <p className="text-sm text-muted mt-0.5">All revenue transactions — from sales orders and manual entries</p>
        </div>
        <div className="flex items-center gap-2">
          <Button color={FIN} variant="secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
          <Button color={FIN} onClick={() => setShowAdd(true)}>
            <Plus size={15} /> Add Income
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} /> {error}
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 hover:shadow-md transition-all">
            <div className="w-8 h-8 flex items-center justify-center rounded-xl mb-2" style={{ backgroundColor: `${s.color}15` }}>
              <s.Icon size={16} style={{ color: s.color }} />
            </div>
            <p className="text-xl font-extrabold text-foreground tracking-tight">{loading ? "—" : s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
            <p className="text-[11px] text-muted/60 mt-0.5">{loading ? "" : s.sub}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1 w-fit">
        {["All", "Posted", "Draft", "Void"].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors ${statusFilter === s ? "text-white" : "text-foreground/50 hover:text-foreground"}`}
            style={statusFilter === s ? { backgroundColor: FIN } : undefined}>
            {s}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-20 flex items-center justify-center gap-2 text-muted">
          <Loader2 size={18} className="animate-spin" /> Loading income...
        </div>
      ) : displayed.length === 0 ? (
        <div className="py-20 text-center bg-card border border-border rounded-xl">
          <TrendingUp size={32} className="text-border mx-auto mb-3" />
          <p className="text-sm font-semibold text-muted">No income entries yet</p>
          <p className="text-xs text-muted mt-1 mb-4">Sales orders and manual entries will appear here</p>
          <Button color={FIN} size="sm" onClick={() => setShowAdd(true)}><Plus size={13} /> Add Income</Button>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Reference</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Description</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Source Account</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Date</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Type</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide text-right">Amount</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayed.map((t) => {
                const amount = txnAmount(t);
                const source = txnSource(t);
                const badge = STATUS_STYLES[t.status] ?? STATUS_STYLES.Draft;
                return (
                  <tr key={t.id} className="hover:bg-surface/50 transition-colors group">
                    <td className="px-4 py-3 text-[12px] font-mono text-muted">{t.reference}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0" style={{ backgroundColor: `${FIN}15` }}>
                          <TrendingUp size={13} style={{ color: FIN }} />
                        </div>
                        <span className="text-sm font-medium text-foreground">{t.description ?? "Income"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted">{source}</td>
                    <td className="px-4 py-3 text-sm text-muted">{t.transaction_date ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-semibold capitalize px-2 py-0.5 rounded-full bg-surface border border-border text-muted">
                        {t.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}>
                        <badge.Icon size={11} /> {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-emerald-600 tabular-nums font-mono">
                      {fmt(amount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {t.status === "Draft" && (
                          <button onClick={() => handlePost(t.id)}
                            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                            Post
                          </button>
                        )}
                        {t.status !== "Void" && (
                          <button onClick={() => handleVoid(t.id)}
                            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                            Void
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Income Drawer */}
      <Drawer open={showAdd} onClose={() => setShowAdd(false)} title="Add Income" description="Record a manual income entry — debits Cash, credits Sales Revenue" size="sm">
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <Field label="Description" required>
            <Input
              autoFocus
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Consulting fee, Service income"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount" required>
              <Input
                type="number" min="0"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0"
              />
            </Field>
            <Field label="Date" required>
              <Input
                type="date"
                value={form.transaction_date}
                onChange={(e) => setForm((f) => ({ ...f, transaction_date: e.target.value }))}
              />
            </Field>
          </div>

          <div className="bg-surface rounded-xl px-4 py-3 text-[12px] text-muted space-y-1">
            <p className="font-semibold text-foreground">Journal entry preview</p>
            <div className="flex justify-between"><span>Debit — Cash / Bank</span><span className="font-mono">{form.amount ? fmt(Number(form.amount)) : "—"}</span></div>
            <div className="flex justify-between"><span>Credit — Sales Revenue</span><span className="font-mono">{form.amount ? fmt(Number(form.amount)) : "—"}</span></div>
          </div>

          {formError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
          )}

          <FormFooter
            submitLabel={saving ? "Saving..." : "Add Income"}
            onCancel={() => setShowAdd(false)}
            disabled={saving || !form.description || !form.amount}
            color={FIN}
          />
        </form>
      </Drawer>
    </div>
  );
}
