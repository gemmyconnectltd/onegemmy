"use client";

import { useDeferredValue, useState, type FormEvent } from "react";
import { Mail, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, FormFooter, Input, Select, Textarea } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableScroll } from "@/components/ui/TableScroll";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/lib/auth";
import {
  useCreateCrmEmailLog, useCrmCampaigns, useCrmEmails, useDeleteCrmEmailLog, useUpdateCrmEmailLog,
} from "@/lib/api/hooks";
import type { ApiEmailLog } from "@/lib/api";

const EMPTY = { recipient: "", subject: "", body: "", status: "Draft", sent_at: "", campaign_id: "" };
const STATUSES = ["Draft", "Sent", "Opened", "Bounced", "Failed"];
const errorText = (error: unknown) => (error as { detail?: string })?.detail ?? "Could not save this email record.";
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString() : "—";

export default function EmailsPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("campaigns:create");
  const canUpdate = hasPermission("campaigns:update");
  const canDelete = hasPermission("campaigns:delete");
  const canManage = canUpdate || canDelete;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApiEmailLog | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const emails = useCrmEmails(page, 25, deferredSearch || undefined, status || undefined);
  const campaigns = useCrmCampaigns(1, 25);
  const create = useCreateCrmEmailLog();
  const update = useUpdateCrmEmailLog();
  const remove = useDeleteCrmEmailLog();
  const { confirm, dialog } = useConfirmDialog();
  const saving = create.isPending || update.isPending;

  function startCreate() {
    setEditing(null); setForm(EMPTY); setError(""); setOpen(true);
  }
  function startEdit(item: ApiEmailLog) {
    setEditing(item);
    setForm({
      recipient: item.recipient, subject: item.subject, body: item.body ?? "", status: item.status,
      sent_at: item.sent_at ? new Date(item.sent_at).toISOString().slice(0, 16) : "",
      campaign_id: item.campaign_id ?? "",
    });
    setError(""); setOpen(true);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = {
      recipient: form.recipient.trim(), subject: form.subject.trim(), body: form.body.trim() || null,
      status: form.status, sent_at: form.sent_at ? new Date(form.sent_at).toISOString() : null,
      campaign_id: form.campaign_id || null,
    };
    const onError = (reason: Error) => setError(errorText(reason));
    const onSuccess = () => { setOpen(false); setError(""); };
    if (editing) update.mutate({ id: editing.id, data }, { onError, onSuccess });
    else create.mutate(data, { onError, onSuccess });
  }
  function confirmDelete(item: ApiEmailLog) {
    confirm({
      title: "Delete email record?", message: `Delete the email record "${item.subject}" for ${item.recipient}?`,
      danger: true, confirmLabel: "Delete record",
      onConfirm: () => remove.mutate(item.id, { onError: reason => setError(errorText(reason)) }),
    });
  }

  return (
    <section className="min-w-0 space-y-4">
      {dialog}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="pesaa-page-title">Emails</h1>
          <p className="mt-1 text-sm text-muted">Search and maintain email records. This screen logs activity; it does not send email.</p>
        </div>
        {canCreate && <Button onClick={startCreate}><Plus size={16} /> Log email</Button>}
      </header>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
        <label className="relative block"><span className="sr-only">Search email records</span><Search size={16} aria-hidden className="absolute left-3 top-3 text-muted" />
          <Input className="pl-9" placeholder="Search recipient or subject" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />
        </label>
        <Select aria-label="Filter email records by status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
          <option value="">All statuses</option>{STATUSES.map(item => <option key={item} value={item}>{item}</option>)}
        </Select>
      </div>
      {error && !open && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {emails.isLoading ? <PageLoader variant="compact" /> : emails.isError ? (
        <p role="alert" className="text-sm text-red-600">Could not load CRM email records. <Button variant="outline" onClick={() => void emails.refetch()}>Retry</Button></p>
      ) : (
        <>
          <TableScroll label="CRM email records" mobileLayout="cards">
            <table className="w-full min-w-[700px] text-sm">
              <thead><tr><th scope="col" className="text-left">Recipient</th><th scope="col" className="text-left">Subject</th><th scope="col" className="text-left">Campaign</th><th scope="col" className="text-left">Date</th><th scope="col" className="text-left">Status</th>{canManage && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
              <tbody>
                {emails.data?.items.map(item => (
                  <tr key={item.id}>
                    <td data-label="Recipient"><span className="inline-flex items-center gap-2"><Mail size={14} aria-hidden className="text-muted" />{item.recipient}</span></td>
                    <td data-label="Subject" className="font-semibold">{item.subject}</td>
                    <td data-label="Campaign">{item.campaign?.name ?? <span className="text-muted">—</span>}</td>
                    <td data-label="Date">{dateTime(item.sent_at ?? item.created_at)}</td>
                    <td data-label="Status">{item.status}</td>
                    {canManage && <td className="text-right whitespace-nowrap">
                      {canUpdate && <Button size="sm" variant="outline" onClick={() => startEdit(item)}>Edit</Button>}
                      {canDelete && <Button size="sm" variant="ghost" onClick={() => confirmDelete(item)}>Delete</Button>}
                    </td>}
                  </tr>
                ))}
                {emails.data?.items.length === 0 && <tr><td colSpan={canManage ? 6 : 5} className="py-10 text-center text-muted">No matching email records.</td></tr>}
              </tbody>
            </table>
          </TableScroll>
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" disabled={page <= 1 || emails.isFetching} onClick={() => setPage(current => current - 1)}>Previous</Button>
            <span className="text-sm text-muted">Page {page} · {emails.data?.total ?? 0} records</span>
            <Button variant="outline" disabled={emails.isFetching || page * 25 >= (emails.data?.total ?? 0)} onClick={() => setPage(current => current + 1)}>Next</Button>
          </div>
        </>
      )}
      <Drawer open={open} onClose={() => setOpen(false)} title={editing ? "Edit email record" : "Log email"} size="lg">
        <form className="space-y-4 p-4" onSubmit={submit}>
          <Field label="Recipient" required><Input required type="email" maxLength={255} value={form.recipient} onChange={event => setForm({ ...form, recipient: event.target.value })} /></Field>
          <Field label="Subject" required><Input required maxLength={255} value={form.subject} onChange={event => setForm({ ...form, subject: event.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status"><Select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}>{[...new Set([...STATUSES, form.status])].map(item => <option key={item}>{item}</option>)}</Select></Field>
            <Field label="Related campaign"><Select value={form.campaign_id} onChange={event => setForm({ ...form, campaign_id: event.target.value })}>
              <option value="">No campaign</option>{campaigns.data?.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select></Field>
          </div>
          <Field label="Sent at"><Input type="datetime-local" value={form.sent_at} onChange={event => setForm({ ...form, sent_at: event.target.value })} /></Field>
          <Field label="Email body"><Textarea rows={6} maxLength={10000} value={form.body} onChange={event => setForm({ ...form, body: event.target.value })} /></Field>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <FormFooter onCancel={() => setOpen(false)} disabled={saving} submitLabel={saving ? "Saving…" : "Save email record"} />
        </form>
      </Drawer>
    </section>
  );
}
