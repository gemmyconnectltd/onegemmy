"use client";

import { useTenants } from "@/lib/api/hooks";
import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { type Tone } from "@/components/ui/Badge";
import { DataCard, Pagination, SearchBox, thClass } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { PriorityBadge } from "@/components/support/parts";
import type { Priority, SupportTicket, TicketStatus } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCreateTicket, useTeam, useTickets, useUpdateTicket } from "@/lib/support/hooks";

const STATUS: { key: TicketStatus; label: string; tone: Tone }[] = [
  { key: "open", label: "Open", tone: "amber" }, { key: "in_progress", label: "In progress", tone: "blue" },
  { key: "resolved", label: "Resolved", tone: "green" }, { key: "closed", label: "Closed", tone: "slate" },
];

function NewTicket({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateTicket();
  const [business, setBusiness] = useState("");
  const [businessSearch, setBusinessSearch] = useState("");
  const [businessPage, setBusinessPage] = useState(1);
  const businesses = useTenants(businessPage, 20, { enabled: open }, { q: businessSearch });
  const [f, setF] = useState({ subject: "", description: "", priority: "normal" as Priority, customer_email: "", customer_name: "" });
  const [error, setError] = useState<string | null>(null);
  const valid = f.subject.trim().length >= 3 && f.description.trim().length > 0;
  const submit = async () => {
    setError(null);
    try {
      await create.mutateAsync({ tenant_id: business || undefined, subject: f.subject.trim(), description: f.description.trim(), priority: f.priority, customer_email: f.customer_email.trim() || undefined, customer_name: f.customer_name.trim() || undefined });
      setF({ subject: "", description: "", priority: "normal", customer_email: "", customer_name: "" });
      setBusiness(""); onClose();
    } catch (e) { setError((e as { detail?: string })?.detail ?? "Couldn't create the ticket."); }
  };
  return (
    <Drawer open={open} onClose={onClose} side="right" size="lg" title="New ticket" description="For a request that didn't arrive through WhatsApp or email."
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void submit()} disabled={!valid || create.isPending}>{create.isPending ? "Creating…" : "Create ticket"}</Button></div>}>
      <div className="space-y-3 px-5 py-4">
        <Field label="Business (optional)"><Input aria-label="Search business" placeholder="Search businesses" value={businessSearch} onChange={e => { setBusinessSearch(e.target.value); setBusinessPage(1); }} /><Select aria-label="Business" value={business} onChange={e => setBusiness(e.target.value)}><option value="">No business</option>{businesses.data?.items.map(t => <option key={t.id} value={t.id}>{t.name.trim()}</option>)}</Select><Pagination page={businessPage} pageSize={20} total={businesses.data?.total ?? 0} onPage={setBusinessPage} noun="business" /></Field>
        <Field label="Subject" required><Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} maxLength={200} /></Field>
        <Field label="Details" required><Textarea rows={5} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Priority"><Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Priority })}>{(["low", "normal", "high", "urgent"] as const).map((p) => <option key={p} value={p} className="capitalize">{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}</Select></Field>
          <Field label="Customer name"><Input value={f.customer_name} onChange={(e) => setF({ ...f, customer_name: e.target.value })} /></Field>
        </div>
        <Field label="Customer email" hint="Optional — recorded on the ticket."><Input type="email" value={f.customer_email} onChange={(e) => setF({ ...f, customer_email: e.target.value })} /></Field>
        {error && <p role="alert" className="text-[12px] text-red-600">{error}</p>}
      </div>
    </Drawer>
  );
}

export default function TicketsPage() {
  const { user } = useAuth();
  const [f, setF] = useState({ status: "", priority: "", assigned: "", search: "" });
  const [page, setPage] = useState(1);
  const [show, setShow] = useState(false);
  const q = useTickets({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page });
  const team = useTeam();
  const update = useUpdateTicket();
  const isManager = user?.role === "superadmin" || user?.role === "support_manager";
  const set = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); setPage(1); };
  const rows = q.data?.items ?? [];

  const assignCell = (t: SupportTicket) => isManager
    ? <Select aria-label={`Assign ${t.reference}`} value={t.assigned_to ?? ""} onChange={(e) => update.mutate(e.target.value ? { id: t.id, assigned_to: e.target.value } : { id: t.id, unassign: true })} className="w-auto! min-w-[120px] py-1 text-[12px]">
        <option value="">Unassigned</option>{(team.data ?? []).filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select>
    : <span className="text-[12px]">{t.assigned_name ?? "Unassigned"}</span>;

  return (
    <div className="space-y-4">
      <PageHeader title="Tickets" subtitle="Support requests and their status." actions={<Button variant="primary" onClick={() => setShow(true)}><Plus size={14} /> New ticket</Button>} />
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={f.search} onChange={(v) => set("search", v)} placeholder="Search subject or PES-000123" />
        <Select aria-label="Status" value={f.status} onChange={(e) => set("status", e.target.value)} className="w-auto!"><option value="">All Statuses</option>{STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</Select>
        <Select aria-label="Priority" value={f.priority} onChange={(e) => set("priority", e.target.value)} className="w-auto! capitalize"><option value="">All Priorities</option>{(["low", "normal", "high", "urgent"] as const).map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}</Select>
        <Select aria-label="Assignee" value={f.assigned} onChange={(e) => set("assigned", e.target.value)} className="w-auto!"><option value="">Everyone</option><option value="mine">Mine</option><option value="unassigned">Unassigned</option></Select>
      </div>
      {q.isError ? <ErrorState message="Couldn't load tickets." onRetry={() => void q.refetch()} /> : (
        <DataCard label="Tickets">
          {q.isLoading ? <p className="p-6 text-sm text-muted">Loading…</p> : rows.length === 0 ? <EmptyState title="No tickets" description="Tickets created from conversations or by businesses appear here." /> : (
            <table className="w-full min-w-[860px] text-left text-[13px]">
              <thead><tr className="border-b border-border bg-surface/40">{["Ticket", "Subject", "Business", "Status", "Priority", "Assigned to", "Created", ""].map((h, i) => <th key={i} scope="col" aria-label={h || "Open"} className={thClass}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">
                {rows.map((t) => (
                  <tr key={t.id} className="hover:bg-surface/40">
                    <td className="px-4 py-3 font-mono text-[12px] font-semibold">{t.reference}</td>
                    <td className="max-w-[280px] px-4 py-3"><p className="truncate font-medium text-foreground">{t.subject}</p>{t.requester_name && <p className="truncate text-[11px] text-muted">{t.requester_name}</p>}</td>
                    <td className="px-4 py-3 text-[12px]">{t.tenant_name ?? <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-3"><Select aria-label={`Status of ${t.reference}`} value={t.status} onChange={(e) => update.mutate({ id: t.id, status: e.target.value as TicketStatus })} className="w-auto! min-w-[110px] py-1 text-[12px]">{STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</Select></td>
                    <td className="px-4 py-3"><PriorityBadge priority={t.priority} /></td>
                    <td className="px-4 py-3">{assignCell(t)}</td>
                    <td className="px-4 py-3 text-[12px] text-muted">{new Date(t.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3"><Link href={`/support?c=${t.conversation_id}`} aria-label={`Open conversation for ${t.reference}`} className="inline-flex rounded-md border border-border p-1.5 text-muted hover:text-foreground"><ExternalLink size={13} /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DataCard>
      )}
      <Pagination page={page} pageSize={30} total={q.data?.total ?? 0} onPage={setPage} noun="ticket" />
      {update.isError && <p role="alert" className="text-[12px] text-red-600">{(update.error as { detail?: string })?.detail ?? "Couldn't update the ticket."}</p>}
      <NewTicket open={show} onClose={() => setShow(false)} />
    </div>
  );
}
