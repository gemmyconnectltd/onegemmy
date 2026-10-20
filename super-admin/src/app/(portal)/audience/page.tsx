"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Loader2, Mail, MessageSquare, Phone } from "lucide-react";
import { adminApi, type AudienceRow } from "@/lib/api";
import { useAudience } from "@/lib/api/hooks";
import { fmtRelative } from "@/lib/date";
import { PageLoader } from "@/components/ui/PageLoader";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataCard, Pagination, SearchBox, thClass } from "@/components/ui/DataTable";
import { Select } from "@/components/ui/Form";
import { ErrorState } from "@/components/ui/EmptyState";
import { OutreachDrawer } from "@/components/support/OutreachDrawer";

const PAGE_SIZE = 25;
const csvCell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const CONTACT_LABEL: Record<string, string> = { email: "Email", phone: "Phone call", whatsapp: "WhatsApp" };

/** Contactable businesses (owner email + business phone). Select rows to message them by email or WhatsApp through Support. */
export default function AudiencePage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ q: "", plan: "", status: "active", preferred_contact: "", sort: "created", dir: "desc" });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [composing, setComposing] = useState<{ id: string; name: string }[] | null>(null);
  const audience = useAudience(page, PAGE_SIZE, filters);
  const set = (key: keyof typeof filters, value: string) => { setFilters((f) => ({ ...f, [key]: value })); setPage(1); };

  const exportCsv = async () => {
    setExporting(true); setExportError("");
    try {
      const all: AudienceRow[] = [];
      for (let p = 1; ; p++) {
        const res = await adminApi.listAudience(p, 100, filters);
        all.push(...res.data.items);
        if (all.length >= res.data.total || res.data.items.length === 0) break;
      }
      const head = ["Business", "Owner", "Owner email", "Phone", "Country", "City", "Plan", "Preferred contact", "Industry", "Created", "Last active"];
      const lines = [head, ...all.map((r) => [r.name, r.owner_name, r.owner_email, r.phone, r.country, r.city, r.plan, CONTACT_LABEL[r.preferred_contact] ?? r.preferred_contact, r.industry, r.created_at?.slice(0, 10), r.last_active_at?.slice(0, 10)])];
      const url = URL.createObjectURL(new Blob(["﻿" + lines.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = `pesaa_audience_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { setExportError("Export failed. Please try again."); }
    setExporting(false);
  };

  const rows = audience.data?.items ?? [];
  const toggle = (r: AudienceRow) => setSelected((m) => { const n = new Map(m); if (n.has(r.id)) n.delete(r.id); else n.set(r.id, r.name); return n; });
  const pageSelectable = rows.filter((r) => !r.marketing_opt_out);
  const allOnPage = pageSelectable.length > 0 && pageSelectable.every((r) => selected.has(r.id));
  const togglePage = () => setSelected((m) => { const n = new Map(m); pageSelectable.forEach((r) => (allOnPage ? n.delete(r.id) : n.set(r.id, r.name))); return n; });
  return <div className="space-y-5">
    <PageHeader title="Audience" subtitle="Businesses you can reach, with the way each one asked to be contacted. Select rows to message them by email or WhatsApp."
      actions={<Button variant="outline" onClick={exportCsv} disabled={exporting || !audience.data?.total}>{exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export CSV</Button>} />
    {selected.size > 0 && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-sm font-medium">{selected.size} selected</p>
      <div className="flex gap-2"><Button variant="outline" onClick={() => setSelected(new Map())}>Clear</Button><Button onClick={() => setComposing([...selected].map(([id, name]) => ({ id, name })))}><MessageSquare size={14} /> Message selected</Button></div>
    </div>}
    {exportError && <p role="alert" className="text-sm text-red-600">{exportError}</p>}
    <div className="flex flex-wrap gap-2">
      <SearchBox value={filters.q} onChange={(v) => set("q", v)} placeholder="Search business, owner, email or phone" />
      <Select aria-label="Plan" className="w-auto!" value={filters.plan} onChange={(e) => set("plan", e.target.value)}>
        <option value="">All plans</option><option value="free">Free</option><option value="starter">Starter</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option>
      </Select>
      <Select aria-label="Preferred contact" className="w-auto!" value={filters.preferred_contact} onChange={(e) => set("preferred_contact", e.target.value)}>
        <option value="">Any contact preference</option><option value="email">Email</option><option value="phone">Phone call</option><option value="whatsapp">WhatsApp</option>
      </Select>
      <Select aria-label="Account status" className="w-auto!" value={filters.status} onChange={(e) => set("status", e.target.value)}>
        <option value="active">Active accounts</option><option value="suspended">Suspended</option><option value="all">All accounts</option>
      </Select>
    </div>
    {audience.isLoading ? <PageLoader variant="compact" /> : audience.isError ? <ErrorState message="Could not load the audience." onRetry={() => void audience.refetch()} /> : (
      <DataCard label="Audience">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead><tr className="border-b border-border bg-surface/50"><th scope="col" className="w-10 px-4 py-3"><input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={togglePage} className="h-4 w-4 rounded" /></th>{["Business", "Owner", "Email", "Phone", "Country", "Plan", "Prefers", "Last active"].map((h) => <th key={h} scope="col" className={thClass}>{h}</th>)}<th scope="col" className={thClass}><span className="sr-only">Message</span></th></tr></thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-muted">No businesses match these filters.</td></tr>}
            {rows.map((r) => <tr key={r.id} className="hover:bg-surface/40">
              <td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${r.name}`} disabled={r.marketing_opt_out} checked={selected.has(r.id)} onChange={() => toggle(r)} className="h-4 w-4 rounded" /></td>
              <td className="px-4 py-3 font-semibold"><Link href={`/tenants/${r.id}`} className="hover:underline">{r.name}</Link>{!r.is_active && <Badge tone="amber" className="ml-2">Suspended</Badge>}{r.marketing_opt_out && <Badge tone="slate" className="ml-2">Unsubscribed</Badge>}</td>
              <td className="px-4 py-3 text-[13px]">{r.owner_name ?? "—"}</td>
              <td className="px-4 py-3 text-[13px]">{r.owner_email ? <a href={`mailto:${r.owner_email}`} className="inline-flex items-center gap-1.5 hover:underline"><Mail size={12} className="text-muted" />{r.owner_email}</a> : <span className="text-muted">No owner email</span>}</td>
              <td className="px-4 py-3 text-[13px]">{r.phone ? <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1.5 hover:underline"><Phone size={12} className="text-muted" />{r.phone}</a> : "—"}</td>
              <td className="px-4 py-3 text-[12px] text-muted">{[r.city, r.country].filter(Boolean).join(", ") || "—"}</td>
              <td className="px-4 py-3 text-[12px] capitalize">{r.plan}</td>
              <td className="px-4 py-3 text-[12px]">{CONTACT_LABEL[r.preferred_contact] ?? r.preferred_contact}</td>
              <td className="px-4 py-3 text-[12px] text-muted">{fmtRelative(r.last_active_at)}</td>
              <td className="px-4 py-3 text-right"><Button variant="outline" size="sm" disabled={r.marketing_opt_out} onClick={() => setComposing([{ id: r.id, name: r.name }])} aria-label={`Message ${r.name}`}><MessageSquare size={13} /> Message</Button></td>
            </tr>)}
          </tbody>
        </table>
      </DataCard>
    )}
    <Pagination page={page} pageSize={PAGE_SIZE} total={audience.data?.total ?? 0} onPage={setPage} noun="business" />
    {composing && <OutreachDrawer recipients={composing} onClose={() => setComposing(null)} onDone={() => setSelected(new Map())} />}
  </div>;
}
