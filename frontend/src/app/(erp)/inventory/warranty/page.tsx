"use client";

import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { type ApiWarrantyClaim } from "@/lib/api";
import { useWarrantyClaims, useCreateWarrantyClaim, useUpdateWarrantyClaim } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-amber-100 text-amber-700",
  pending: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  refunded: "bg-blue-100 text-blue-700",
  replaced: "bg-violet-100 text-violet-700",
};

const NEXT_STATUSES = ["pending", "completed", "rejected", "refunded", "replaced"];

export default function WarrantyPage() {
  const [status, setStatus] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [serialId, setSerialId] = useState("");
  const [issue, setIssue] = useState("");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useWarrantyClaims(1, 100, status || undefined);
  const createClaim = useCreateWarrantyClaim();
  const updateClaim = useUpdateWarrantyClaim();
  const claims = data?.items ?? [];

  const filtered = claims.filter((c) =>
    !search || c.serial_number?.toLowerCase().includes(search.toLowerCase())
    || c.product_name?.toLowerCase().includes(search.toLowerCase())
    || c.claim_number?.toLowerCase().includes(search.toLowerCase()));

  async function handleAdd() {
    if (!serialId.trim() || !issue.trim() || createClaim.isPending) return;
    try {
      await createClaim.mutateAsync({ serial_id: serialId.trim(), issue_description: issue.trim() });
      setSerialId(""); setIssue(""); setAdding(false);
    } catch { /* ignore */ }
  }

  async function handleStatus(id: string, next: string) {
    try { await updateClaim.mutateAsync({ id, data: { status: next } }); } catch { /* ignore */ }
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Warranty Claims</h1>
          <p className="text-sm text-muted mt-0.5">{claims.length} claims</p>
        </div>
        <Button onClick={() => setAdding(!adding)} color="#059669" className="rounded-lg">
          <Plus size={15} /> New Claim
        </Button>
      </div>

      {adding && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
          <p className="text-sm font-bold text-foreground">Submit Warranty Claim</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted mb-1.5 block">Serial ID</label>
              <input type="text" placeholder="Serial id of sold item" value={serialId}
                onChange={(e) => setSerialId(e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted mb-1.5 block">Issue description</label>
              <input type="text" placeholder="e.g. screen won't turn on" value={issue}
                onChange={(e) => setIssue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAdd} disabled={createClaim.isPending || !serialId.trim() || !issue.trim()} color="#059669" className="rounded-lg">
              {createClaim.isPending ? "Submitting…" : "Submit Claim"}
            </Button>
            <Button variant="secondary" onClick={() => setAdding(false)} className="rounded-lg">Cancel</Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input type="text" placeholder="Search claims…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none bg-card" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2.5 border border-border rounded-lg text-sm bg-card outline-none">
          <option value="">All statuses</option>
          {NEXT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
              <th className="px-4 py-3 font-semibold">Claim</th>
              <th className="px-4 py-3 font-semibold">Product / Serial</th>
              <th className="px-4 py-3 font-semibold">Issue</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c: ApiWarrantyClaim) => (
              <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-surface/50">
                <td className="px-4 py-3">
                  <div className="font-semibold text-foreground">{c.claim_number}</div>
                  <div className="text-xs text-muted">{c.created_at ? new Date(c.created_at).toLocaleDateString() : "—"}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-foreground">{c.product_name ?? "—"}</div>
                  <div className="text-xs text-muted font-mono">{c.serial_number}</div>
                </td>
                <td className="px-4 py-3 text-muted max-w-xs truncate">{c.issue_description}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[c.status] ?? "bg-surface text-muted"}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {c.status === "submitted" || c.status === "pending" ? (
                    <select
                      value=""
                      onChange={(e) => e.target.value && handleStatus(c.id, e.target.value)}
                      className="px-2 py-1.5 border border-border rounded-lg text-xs bg-card outline-none">
                      <option value="">Update…</option>
                      {NEXT_STATUSES.filter((s) => s !== "pending").map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-muted">{c.resolution_notes || "—"}</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center text-muted text-sm">No warranty claims found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
