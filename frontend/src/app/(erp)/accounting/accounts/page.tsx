"use client";

import { useState } from "react";
import { CreditCard, Plus, RefreshCw, Sparkles } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { useAccounts, useCreateAccount, useSeedAccounts } from "@/lib/api/hooks";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import { EmptyState, ErrorState } from "@/components/hr/State";

const ACCOUNT_TYPES = ["Assets", "Liabilities", "Equity", "Revenue", "Expense"];
const TYPE_FILTERS = ["All", ...ACCOUNT_TYPES];
const TYPE_COLORS: Record<string, string> = {
  Assets: "bg-emerald-50 text-emerald-700",
  Liabilities: "bg-red-50 text-red-600",
  Equity: "bg-blue-50 text-blue-700",
  Revenue: "bg-emerald-50 text-emerald-700",
  Expense: "bg-amber-50 text-amber-700",
};

export default function AccountsPage() {
  const [type, setType] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    type: "Assets",
    normal_balance: "debit",
    description: "",
  });

  const accountsQ = useAccounts(type === "All" ? undefined : type);
  const accounts = accountsQ.data?.items ?? [];
  const loading = accountsQ.isLoading;
  const error = accountsQ.isError ? "Could not load accounts." : null;

  const createAccount = useCreateAccount();
  const seedAccounts = useSeedAccounts();
  const saving = createAccount.isPending;
  const seeding = seedAccounts.isPending;

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setNotice(null);
    createAccount.mutate(
      {
        code: form.code,
        name: form.name,
        type: form.type,
        normal_balance: form.normal_balance,
        description: form.description || null,
      },
      {
        onSuccess: () => {
          setShowForm(false);
          setForm({ code: "", name: "", type: "Assets", normal_balance: "debit", description: "" });
        },
        onError: () => setNotice("Could not create the account (code may already exist)."),
      },
    );
  };

  const seed = () => {
    setNotice(null);
    seedAccounts.mutate(undefined, {
      onError: () => setNotice("Could not seed the chart of accounts."),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Accounts</h1>
          <p className="text-sm text-muted mt-0.5">{accounts.length} accounts in your chart</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={seed}
            disabled={seeding}
            className="flex items-center gap-2 border border-border px-4 py-2.5 text-sm font-semibold hover:bg-surface transition-colors rounded-lg disabled:opacity-60"
          >
            {seeding ? <RefreshCw size={15} className="animate-spin" /> : <Sparkles size={15} className="text-accent" />} Seed Defaults
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 text-white px-4 py-2.5 text-sm font-semibold transition-colors rounded-lg"
            style={{ backgroundColor: "#b45309" }}
          >
            <Plus size={15} /> Add Account
          </button>
        </div>
      </div>

      {notice && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{notice}</p>}

      <div className="flex flex-wrap gap-2">
        {TYPE_FILTERS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${type === t ? "text-white" : "text-muted hover:bg-surface"}`}
            style={type === t ? { backgroundColor: "#b45309" } : undefined}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <PageLoader variant="compact" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => accountsQ.refetch()} />
      ) : accounts.length === 0 ? (
        <div className="bg-card border border-border rounded-xl">
          <EmptyState message="No accounts yet. Use “Seed Defaults” to create a standard chart of accounts." />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="p-4 font-semibold">Code</th>
                <th className="p-4 font-semibold">Account</th>
                <th className="p-4 font-semibold">Type</th>
                <th className="p-4 font-semibold">Normal Balance</th>
                <th className="p-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {accounts.map((a) => (
                <tr key={a.id} className="hover:bg-surface/50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#b4530915" }}>
                        <CreditCard size={14} style={{ color: "#b45309" }} />
                      </div>
                      <span className="text-xs text-muted font-mono">{a.code}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <p className="text-sm font-medium text-foreground">{a.name}</p>
                    {a.description && <p className="text-xs text-muted">{a.description}</p>}
                  </td>
                  <td className="p-4"><span className={`text-xs font-medium px-2 py-1 ${TYPE_COLORS[a.type] ?? "bg-surface text-muted"}`}>{a.type}</span></td>
                  <td className="p-4 text-sm text-muted capitalize">{a.normal_balance}</td>
                  <td className="p-4">
                    <span className={`text-xs font-medium px-2 py-1 ${a.is_active ? "bg-emerald-50 text-emerald-700" : "bg-surface text-muted"}`}>
                      {a.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={showForm} onClose={() => setShowForm(false)} title="Add Account" description="Create a new chart of accounts entry">
        <form onSubmit={submit} className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code" required>
              <Input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="1010" />
            </Field>
            <Field label="Name" required>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Main Cash" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" required>
              <Select value={form.type} onChange={(e) => {
                const t = e.target.value;
                setForm({ ...form, type: t, normal_balance: t === "Assets" || t === "Expense" ? "debit" : "credit" });
              }}>
                {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Normal balance">
              <Select value={form.normal_balance} onChange={(e) => setForm({ ...form, normal_balance: e.target.value })}>
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </Select>
            </Field>
          </div>
          <Field label="Description">
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" />
          </Field>
          <FormFooter submitLabel={saving ? "Saving…" : "Add Account"} onCancel={() => setShowForm(false)} disabled={saving} />
        </form>
      </Drawer>
    </div>
  );
}
