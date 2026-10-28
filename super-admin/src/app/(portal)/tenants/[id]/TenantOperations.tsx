"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, Bell, Database, Download, Loader2, Power, Archive } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { adminApi, type AdminTenant, type AdminUser, type NotificationInput } from "@/lib/api";
import { useActivateTenant, useArchiveRequests, useDecideArchive, useRequestArchive, useRequestTenantExport, useSendTenantNotification, useSuspendTenant, useTenantExports, useTenantNotifications } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Form";
import { fmtDateTime } from "@/lib/date";
import { tenantStatusLabel } from "@/lib/api/admin";
import { Card } from "./TenantPanels";

const message = (e: unknown, fallback: string) => (e as { detail?: string })?.detail ?? (e instanceof Error ? e.message : fallback);
function Result({ kind, children }: { kind: "ok" | "error"; children: ReactNode }) {
  return <p role={kind === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-[12.5px] ${kind === "error" ? "border-red-500/20 bg-red-500/10 text-red-600" : "border-accent/20 bg-accent/5 text-accent"}`}>{children}</p>;
}
function Label({ text, children }: { text: string; children: ReactNode }) { return <label className="block text-[12px] font-semibold">{text}<div className="mt-1 font-normal">{children}</div></label>; }
const when = (v: string | null | undefined) => (v ? fmtDateTime(v) : "—");

export function OperationsPanel({ tenant, users }: { tenant: AdminTenant; users: AdminUser[] }) {
  return (
    <div className="space-y-4">
      <AccessCard tenant={tenant} />
      <NotificationCard tenant={tenant} users={users} />
      <ExportCard tenant={tenant} />
      <BackupCard />
      <ArchiveCard tenant={tenant} />
    </div>
  );
}

function AccessCard({ tenant }: { tenant: AdminTenant }) {
  const suspend = useSuspendTenant();
  const activate = useActivateTenant();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [name, setName] = useState("");
  const [notify, setNotify] = useState(true);
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const status = tenantStatusLabel(tenant);
  const canSubmit = reason.trim().length >= 5 && name.trim() === tenant.name.trim();
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    suspend.mutate({ id: tenant.id, body: { reason: reason.trim(), confirm_name: name.trim(), notify_owner: notify } }, {
      onSuccess: (r) => { setResult({ kind: "ok", text: `Business suspended. ${r.data.notified_owner ? "The owner was emailed." : "The owner was not emailed."}` }); setOpen(false); setReason(""); setName(""); },
      onError: (err) => setResult({ kind: "error", text: message(err, "Could not suspend this business") }),
    });
  }
  return (
    <Card title="Access" action={<span className="text-[12px] font-semibold">{status}</span>}>
      <div className="space-y-3">
        {tenant.suspended_at && !tenant.is_active && <p className="text-[12.5px] text-muted">Suspended {when(tenant.suspended_at)}{tenant.suspension_reason ? ` · Reason: ${tenant.suspension_reason}` : ""}. Everyone in the business is signed out on their next request; data, transactions and audit logs are kept.</p>}
        {tenant.reactivated_at && tenant.is_active && <p className="text-[12.5px] text-muted">Last reactivated {when(tenant.reactivated_at)}.</p>}
        {result && <Result kind={result.kind}>{result.text}</Result>}
        {tenant.archived_at ? <p className="text-[12.5px] text-muted">This business is archived and cannot be activated.</p>
          : tenant.is_active ? (open ? (
            <form onSubmit={submit} className="space-y-3 rounded-lg border border-border p-3">
              <Label text="Reason (shown to the owner)"><Textarea required minLength={5} maxLength={1000} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Label>
              <Label text={`Type “${tenant.name.trim()}” to confirm`}><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" /></Label>
              <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />Email the business owner</label>
              <div className="flex gap-2"><Button type="submit" variant="danger" disabled={!canSubmit || suspend.isPending}>{suspend.isPending && <Loader2 size={13} className="animate-spin" />}Suspend business</Button><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button></div>
            </form>
          ) : <Button variant="outline" onClick={() => { setOpen(true); setResult(null); }}><Power size={14} />Suspend business…</Button>)
          : <Button variant="primary" disabled={activate.isPending} onClick={() => activate.mutate({ id: tenant.id }, { onSuccess: () => setResult({ kind: "ok", text: "Business reactivated." }), onError: (err) => setResult({ kind: "error", text: message(err, "Could not reactivate") }) })}>{activate.isPending && <Loader2 size={13} className="animate-spin" />}{tenant.subscription_status === "pending" ? "Approve business" : "Reactivate business"}</Button>}
      </div>
    </Card>
  );
}

function NotificationCard({ tenant, users }: { tenant: AdminTenant; users: AdminUser[] }) {
  const history = useTenantNotifications(tenant.id);
  const send = useSendTenantNotification();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<NotificationInput & { action_url: string }>({ kind: "announcement", audience: "owner", user_ids: [], subject: "", message: "", action_url: "" });
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const toggleUser = (id: string) => setF((c) => ({ ...c, user_ids: c.user_ids.includes(id) ? c.user_ids.filter((u) => u !== id) : [...c.user_ids, id] }));
  function submit(e: FormEvent) {
    e.preventDefault();
    send.mutate({ id: tenant.id, body: { ...f, action_url: f.action_url.trim() || undefined } }, {
      onSuccess: (r) => { setResult({ kind: r.data.sent ? "ok" : "error", text: `${r.data.sent} of ${r.data.recipients} email${r.data.recipients === 1 ? "" : "s"} accepted by the mail server${r.data.failed ? `; ${r.data.failed} failed` : ""}.` }); setOpen(false); setF((c) => ({ ...c, subject: "", message: "", action_url: "", user_ids: [] })); },
      onError: (err) => setResult({ kind: "error", text: message(err, "Could not send the notification") }),
    });
  }
  return (
    <Card title="Send notification" action={!open && <Button variant="outline" onClick={() => { setOpen(true); setResult(null); }}><Bell size={14} />New notification</Button>}>
      <div className="space-y-3">
        {result && <Result kind={result.kind}>{result.text}</Result>}
        {open && <form onSubmit={submit} className="space-y-3 rounded-lg border border-border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Label text="Type"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as NotificationInput["kind"] })}><option value="announcement">Announcement</option><option value="billing">Billing reminder</option><option value="maintenance">Maintenance alert</option><option value="security">Security notice</option></Select></Label>
            <Label text="Recipients"><Select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value as NotificationInput["audience"] })}><option value="owner">Business owner</option><option value="admins">Owner and administrators</option><option value="selected">Selected users</option><option value="all">All active users</option></Select></Label>
          </div>
          {f.audience === "selected" && <fieldset className="max-h-40 space-y-1 overflow-auto rounded-lg border border-border p-2"><legend className="px-1 text-[11.5px] text-muted">Choose users</legend>{users.filter((u) => u.is_active).map((u) => <label key={u.id} className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={f.user_ids.includes(u.id)} onChange={() => toggleUser(u.id)} />{u.full_name} <span className="text-muted">{u.email}</span></label>)}</fieldset>}
          <Label text="Subject"><Input required minLength={3} maxLength={200} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Label>
          <Label text="Message"><Textarea required minLength={3} maxLength={5000} rows={5} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Label>
          <Label text="Action link (optional)"><Input type="url" placeholder="https://" value={f.action_url} onChange={(e) => setF({ ...f, action_url: e.target.value })} /></Label>
          <div className="flex gap-2"><Button type="submit" variant="primary" disabled={send.isPending || (f.audience === "selected" && !f.user_ids.length)}>{send.isPending && <Loader2 size={13} className="animate-spin" />}Send email</Button><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button></div>
          <p className="text-[11.5px] text-muted">Delivery is by email. “Accepted” means the mail server took the message, not that it was read. An identical message to the same people is blocked for 10 minutes.</p>
        </form>}
        {history.data?.length ? <ul className="divide-y divide-border/60">{history.data.map((n) => <li key={n.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-[13px]"><span className="min-w-0"><span className="block font-semibold">{n.subject}</span><span className="text-[11.5px] capitalize text-muted">{n.kind} · {n.audience} · {when(n.created_at)}</span></span><span className={`text-[12px] font-semibold ${n.status === "sent" ? "text-accent" : "text-red-600"}`}>{n.sent}/{n.recipients} accepted{n.failed ? ` · ${n.failed} failed` : ""}</span></li>)}</ul>
          : <p className="text-[12.5px] text-muted">{history.isLoading ? "Loading…" : "No notifications have been sent to this business yet."}</p>}
      </div>
    </Card>
  );
}

const CATEGORIES: [string, string][] = [["sales", "Sales"], ["inventory", "Inventory"], ["purchases", "Purchases"], ["expenses", "Expenses"], ["customers", "Customers"], ["suppliers", "Suppliers"], ["users", "Users (no passwords)"], ["financial", "Financial records"]];

function ExportCard({ tenant }: { tenant: AdminTenant }) {
  const history = useTenantExports(tenant.id);
  const request = useRequestTenantExport();
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<string[]>(["sales"]);
  const [fmt, setFmt] = useState<"csv" | "xlsx" | "zip">("zip");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const toggle = (key: string) => setCategories((c) => c.includes(key) ? c.filter((k) => k !== key) : [...c, key]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setResult(null);
    try {
      const made = await request.mutateAsync({ id: tenant.id, body: { categories, fmt: categories.length > 1 && fmt === "csv" ? "zip" : fmt, ...(from ? { date_from: from } : {}), ...(to ? { date_to: to } : {}) } });
      await adminApi.downloadExport(made.data.download_url);
      setResult({ kind: "ok", text: "Export downloaded. The download link expires in 15 minutes and this export is recorded in the audit log." });
      setOpen(false);
    } catch (err) { setResult({ kind: "error", text: message(err, "Could not create the export") }); } finally { setBusy(false); }
  }
  return (
    <Card title="Export business data" action={!open && <Button variant="outline" onClick={() => { setOpen(true); setResult(null); }}><Download size={14} />New export</Button>}>
      <div className="space-y-3">
        {result && <Result kind={result.kind}>{result.text}</Result>}
        {open && <form onSubmit={submit} className="space-y-3 rounded-lg border border-border p-3">
          <fieldset className="grid gap-1.5 sm:grid-cols-2"><legend className="mb-1 text-[12px] font-semibold">Data to include</legend>{CATEGORIES.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={categories.includes(key)} onChange={() => toggle(key)} />{label}</label>)}</fieldset>
          <div className="grid gap-3 sm:grid-cols-3">
            <Label text="Format"><Select value={fmt} onChange={(e) => setFmt(e.target.value as typeof fmt)}><option value="zip">ZIP of CSV files</option><option value="xlsx">Excel workbook</option><option value="csv" disabled={categories.length > 1}>Single CSV</option></Select></Label>
            <Label text="From (optional)"><Input type="date" max={to || undefined} value={from} onChange={(e) => setFrom(e.target.value)} /></Label>
            <Label text="To (optional)"><Input type="date" min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} /></Label>
          </div>
          <div className="flex gap-2"><Button type="submit" variant="primary" disabled={busy || !categories.length}>{busy && <Loader2 size={13} className="animate-spin" />}Create and download</Button><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button></div>
          <p className="text-[11.5px] text-muted">Dates filter by when each record was created. Each category is limited to 100,000 rows. Contains only this business&apos;s data.</p>
        </form>}
        {history.data?.length ? <ul className="divide-y divide-border/60">{history.data.map((x) => <li key={x.id} className="py-2 text-[13px]"><span className="block capitalize">{x.categories.join(", ")} · {x.format.toUpperCase()}</span><span className="text-[11.5px] text-muted">{x.requested_by ?? "Unknown"} · {when(x.created_at)} · {x.downloads} download{x.downloads === 1 ? "" : "s"}</span></li>)}</ul>
          : <p className="text-[12.5px] text-muted">{history.isLoading ? "Loading…" : "No exports have been made for this business."}</p>}
      </div>
    </Card>
  );
}

function BackupCard() {
  return (
    <Card title="Backup & restore">
      <div className="flex items-start gap-2 text-[12.5px] text-muted"><Database size={15} className="mt-0.5 shrink-0" aria-hidden /><p>Database backups are not managed from this portal yet, so nothing is shown here rather than invent backup dates or sizes. Backups and restore tests belong to the database platform (scheduled, encrypted snapshots, restore into an isolated environment). Until a restore has been tested successfully, treat backups as unverified. Use <strong>Export business data</strong> above for a per-business copy.</p></div>
    </Card>
  );
}

function ArchiveCard({ tenant }: { tenant: AdminTenant }) {
  const { user } = useAuth();
  const overview = useArchiveRequests(tenant.id);
  const create = useRequestArchive();
  const decide = useDecideArchive();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [name, setName] = useState("");
  const [ack, setAck] = useState(false);
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const pending = overview.data?.requests.find((r) => r.status === "pending");
  const canSubmit = reason.trim().length >= 10 && name.trim() === tenant.name.trim() && ack;
  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate({ id: tenant.id, body: { reason: reason.trim(), confirm_name: name.trim(), acknowledge: ack } }, {
      onSuccess: () => { setResult({ kind: "ok", text: "Archive request created. A different administrator must approve it before anything changes." }); setOpen(false); setReason(""); setName(""); setAck(false); },
      onError: (err) => setResult({ kind: "error", text: message(err, "Could not create the request") }),
    });
  }
  const act = (requestId: string, action: "approve" | "reject" | "cancel") => decide.mutate({ id: tenant.id, requestId, action }, {
    onSuccess: () => setResult({ kind: "ok", text: action === "approve" ? "Business archived. All records are retained." : action === "reject" ? "Request rejected." : "Request cancelled." }),
    onError: (err) => setResult({ kind: "error", text: message(err, "That did not work") }),
  });
  return (
    <Card title="Archive business" className="border-red-500/30" action={<AlertTriangle size={15} className="text-red-600" aria-hidden />}>
      <div className="space-y-3">
        <p className="text-[12.5px] text-muted">Archiving stops all access and keeps every record, user and audit log. There is no one-click permanent deletion: it takes a reason, the typed business name and approval by a second administrator. Permanent erasure is not offered here; it needs a legal and retention review.</p>
        {result && <Result kind={result.kind}>{result.text}</Result>}
        {tenant.archived_at ? <p className="text-[12.5px] font-semibold">Archived {when(tenant.archived_at)}.</p>
          : pending ? (
            <div className="space-y-2 rounded-lg border border-border p-3 text-[13px]">
              <p><strong>Waiting for approval</strong> · requested by {pending.requested_by ?? "an administrator"} on {when(pending.created_at)}</p>
              <p className="text-muted">Reason: {pending.reason}</p>
              {pending.checks.warnings?.map((w) => <p key={w} className="text-amber-600">⚠ {w}</p>)}
              <div className="flex flex-wrap gap-2">
                {pending.requested_by_id === user?.id
                  ? <Button variant="secondary" disabled={decide.isPending} onClick={() => act(pending.id, "cancel")}>Cancel request</Button>
                  : <><Button variant="danger" disabled={decide.isPending} onClick={() => act(pending.id, "approve")}><Archive size={14} />Approve and archive</Button><Button variant="secondary" disabled={decide.isPending} onClick={() => act(pending.id, "reject")}>Reject</Button></>}
              </div>
              {pending.requested_by_id === user?.id && <p className="text-[11.5px] text-muted">You made this request, so someone else has to approve it.</p>}
            </div>
          ) : open ? (
            <form onSubmit={submit} className="space-y-3 rounded-lg border border-border p-3">
              <Label text="Reason (at least 10 characters)"><Textarea required rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></Label>
              <Label text={`Type “${tenant.name.trim()}” to confirm`}><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" /></Label>
              <label className="flex items-start gap-2 text-[12.5px]"><input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />I understand this business and its users will lose access.</label>
              <div className="flex gap-2"><Button type="submit" variant="danger" disabled={!canSubmit || create.isPending}>{create.isPending && <Loader2 size={13} className="animate-spin" />}Request archive</Button><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button></div>
            </form>
          ) : <Button variant="outline" onClick={() => { setOpen(true); setResult(null); }}><Archive size={14} />Request archive…</Button>}
        {overview.data?.requests.filter((r) => r.status !== "pending").length ? <ul className="divide-y divide-border/60 text-[12.5px]">{overview.data.requests.filter((r) => r.status !== "pending").map((r) => <li key={r.id} className="py-1.5"><span className="font-semibold capitalize">{r.status}</span> · {when(r.decided_at ?? r.created_at)} · <span className="text-muted">{r.reason}</span></li>)}</ul> : null}
      </div>
    </Card>
  );
}
