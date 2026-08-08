"use client";
import { useMemo } from "react";
import { Plus, Phone, Mail } from "lucide-react";
import { useCustomers, useDeals } from "@/lib/api/hooks";

const stageColor: Record<string, string> = {
  Leads:       "bg-slate-100 text-slate-700",
  Qualified:   "bg-purple-50 text-purple-700",
  Proposal:    "bg-blue-50 text-blue-700",
  Negotiation: "bg-amber-50 text-amber-700",
  "Closed Won": "bg-emerald-50 text-emerald-700",
  "Closed Lost": "bg-red-50 text-red-600",
};

export default function ContactsPage() {
  const customersQ = useCustomers(1, 500);
  const dealsQ = useDeals(1, 500);

  const rows = useMemo(() => {
    const stageByCustomer = new Map<string, string>();
    for (const d of dealsQ.data?.items ?? []) {
      if (!d.customer_id || d.stage === "Closed Lost") continue;
      stageByCustomer.set(d.customer_id, d.stage);
    }
    return (customersQ.data?.items ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      company: c.customer_type || "—",
      email: c.email,
      phone: c.phone,
      stage: stageByCustomer.get(c.id),
    }));
  }, [customersQ.data, dealsQ.data]);

  const loading = customersQ.isLoading || dealsQ.isLoading;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Contacts</h1>
        <a href="/customers" className="flex items-center gap-2 bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90"><Plus size={16} />Add Contact</a>
      </div>
      <div className="bg-card border border-border">
        <table className="w-full">
          <thead><tr className="border-b border-border text-left text-xs text-muted">
            <th className="p-4 font-medium">Name</th><th className="p-4 font-medium">Type</th><th className="p-4 font-medium">Email</th><th className="p-4 font-medium">Phone</th><th className="p-4 font-medium">Stage</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={5} className="p-6 text-sm text-muted">Loading contacts…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-sm text-muted">No contacts yet.</td></tr>
            ) : rows.map((c) => (
              <tr key={c.id} className="hover:bg-surface/50">
                <td className="p-4"><div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">{c.name.split(" ").map((n)=>n[0]).join("").slice(0,2)}</div>
                  <span className="text-sm font-medium text-foreground">{c.name}</span>
                </div></td>
                <td className="p-4 text-sm text-muted">{c.company}</td>
                <td className="p-4"><div className="flex items-center gap-1.5 text-sm text-muted"><Mail size={12} />{c.email ?? "—"}</div></td>
                <td className="p-4"><div className="flex items-center gap-1.5 text-sm text-muted"><Phone size={12} />{c.phone ?? "—"}</div></td>
                <td className="p-4">
                  {c.stage ? (
                    <span className={`text-xs font-medium px-2 py-1 ${stageColor[c.stage] ?? "bg-surface text-muted"}`}>{c.stage}</span>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
