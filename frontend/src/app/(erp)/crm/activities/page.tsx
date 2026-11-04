"use client";

import { useDeferredValue, useState, type FormEvent } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, FormFooter, Input, Select, Textarea } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableScroll } from "@/components/ui/TableScroll";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/lib/auth";
import {
  useCreateCrmActivity, useCrmActivities, useCrmContacts, useCrmOpportunities,
  useDeleteCrmActivity, useUpdateCrmActivity,
} from "@/lib/api/hooks";
import type { ApiCrmActivity } from "@/lib/api";

const EMPTY = { kind: "task", subject: "", description: "", status: "open", due_at: "", link_type: "contact", linked_id: "" };
const errorText = (error: unknown) => (error as { detail?: string })?.detail ?? "Could not save this activity.";
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString() : "—";

export default function ActivitiesPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("activities:create");
  const canUpdate = hasPermission("activities:update");
  const canDelete = hasPermission("activities:delete");
  const canManage = canUpdate || canDelete;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [opportunitySearch, setOpportunitySearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApiCrmActivity | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const activities = useCrmActivities(page, 25, { search: deferredSearch || undefined, status: (status || undefined) as ApiCrmActivity["status"] | undefined });
  const contacts = useCrmContacts(1, 25, contactSearch.trim() || undefined);
  const opportunities = useCrmOpportunities(1, 25, undefined, opportunitySearch.trim() || undefined);
  const create = useCreateCrmActivity();
  const update = useUpdateCrmActivity();
  const remove = useDeleteCrmActivity();
  const { confirm, dialog } = useConfirmDialog();
  const saving = create.isPending || update.isPending;

  function startCreate() {
    setEditing(null); setForm(EMPTY); setContactSearch(""); setOpportunitySearch(""); setError(""); setOpen(true);
  }
  function startEdit(item: ApiCrmActivity) {
    const link_type = item.customer_id ? "contact" : "opportunity";
    setContactSearch(link_type === "contact" ? item.customer?.name ?? "" : "");
    setOpportunitySearch(link_type === "opportunity" ? item.deal?.name ?? "" : "");
    setEditing(item);
    setForm({
      kind: item.kind, subject: item.subject, description: item.description ?? "", status: item.status,
      due_at: item.due_at ? new Date(item.due_at).toISOString().slice(0, 16) : "",
      link_type, linked_id: item.customer_id ?? item.deal_id ?? "",
    });
    setError(""); setOpen(true);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = {
      kind: form.kind, subject: form.subject.trim(), description: form.description.trim() || null,
      status: form.status, due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      customer_id: form.link_type === "contact" ? form.linked_id : null,
      deal_id: form.link_type === "opportunity" ? form.linked_id : null,
    };
    const onError = (reason: Error) => setError(errorText(reason));
    const onSuccess = () => { setOpen(false); setError(""); };
    if (editing) update.mutate({ id: editing.id, data }, { onError, onSuccess });
    else create.mutate(data, { onError, onSuccess });
  }
  function confirmDelete(item: ApiCrmActivity) {
    confirm({
      title: "Delete activity?", message: `Delete "${item.subject}" from the CRM timeline?`,
      danger: true, confirmLabel: "Delete activity",
      onConfirm: () => remove.mutate(item.id, { onError: reason => setError(errorText(reason)) }),
    });
  }

  return (
    <section className="min-w-0 space-y-4">
      {dialog}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="pesaa-page-title">Activities</h1><p className="mt-1 text-sm text-muted">Calls, meetings, emails, notes and follow-ups attached to CRM records.</p></div>
        {canCreate && <Button onClick={startCreate}><Plus size={16} /> Log activity</Button>}
      </header>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
        <label className="relative block"><span className="sr-only">Search activities</span><Search size={16} aria-hidden className="absolute left-3 top-3 text-muted" />
          <Input className="pl-9" placeholder="Search subject or description" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />
        </label>
        <Select aria-label="Filter activities by status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
          <option value="">All statuses</option><option value="open">Open</option><option value="done">Done</option><option value="cancelled">Cancelled</option>
        </Select>
      </div>
      {error && !open && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {activities.isLoading ? <PageLoader variant="compact" /> : activities.isError ? (
        <p role="alert" className="text-sm text-red-600">Could not load CRM activities. <Button variant="outline" onClick={() => void activities.refetch()}>Retry</Button></p>
      ) : (
        <>
          <TableScroll label="CRM activities" mobileLayout="cards">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr><th scope="col" className="text-left">Activity</th><th scope="col" className="text-left">Linked record</th><th scope="col" className="text-left">Due</th><th scope="col" className="text-left">Status</th>{canManage && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
              <tbody>
                {activities.data?.items.map(item => (
                  <tr key={item.id}>
                    <td data-label="Activity"><div className="font-semibold">{item.subject}</div><div className="mt-1 text-xs capitalize text-muted">{item.kind}{item.description ? ` · ${item.description}` : ""}</div></td>
                    <td data-label="Linked record">{item.customer?.name ?? item.deal?.name ?? <span className="text-muted">Record removed</span>}</td>
                    <td data-label="Due">{dateTime(item.due_at)}</td>
                    <td data-label="Status" className="capitalize">{item.status}</td>
                    {canManage && <td className="text-right whitespace-nowrap">
                      {canUpdate && item.status === "open" && <Button size="sm" variant="outline" onClick={() => update.mutate({ id: item.id, data: { status: "done" } }, { onError: reason => setError(errorText(reason)) })}>Complete</Button>}
                      {canUpdate && <Button size="sm" variant="outline" onClick={() => startEdit(item)}>Edit</Button>}
                      {canDelete && <Button size="sm" variant="ghost" onClick={() => confirmDelete(item)}>Delete</Button>}
                    </td>}
                  </tr>
                ))}
                {activities.data?.items.length === 0 && <tr><td colSpan={canManage ? 5 : 4} className="py-10 text-center text-muted">No matching activities.</td></tr>}
              </tbody>
            </table>
          </TableScroll>
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" disabled={page <= 1 || activities.isFetching} onClick={() => setPage(current => current - 1)}>Previous</Button>
            <span className="text-sm text-muted">Page {page} · {activities.data?.total ?? 0} activities</span>
            <Button variant="outline" disabled={activities.isFetching || page * 25 >= (activities.data?.total ?? 0)} onClick={() => setPage(current => current + 1)}>Next</Button>
          </div>
        </>
      )}
      <Drawer open={open} onClose={() => setOpen(false)} title={editing ? "Edit activity" : "Log activity"} size="lg">
        <form className="space-y-4 p-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Activity type"><Select value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value })}>
              {["call", "meeting", "email", "note", "task"].map(kind => <option key={kind} value={kind} className="capitalize">{kind[0].toUpperCase() + kind.slice(1)}</option>)}
            </Select></Field>
            <Field label="Status"><Select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}>
              <option value="open">Open</option><option value="done">Done</option><option value="cancelled">Cancelled</option>
            </Select></Field>
          </div>
          <Field label="Subject" required><Input required maxLength={255} value={form.subject} onChange={event => setForm({ ...form, subject: event.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Link type"><Select value={form.link_type} onChange={event => setForm({ ...form, link_type: event.target.value, linked_id: "" })}><option value="contact">Contact</option><option value="opportunity">Opportunity</option></Select></Field>
            <Field label="Find a record"><Input placeholder="Search linked records" value={form.link_type === "contact" ? contactSearch : opportunitySearch} onChange={event => form.link_type === "contact" ? setContactSearch(event.target.value) : setOpportunitySearch(event.target.value)} /></Field>
          </div>
          <Field label={form.link_type === "contact" ? "Contact" : "Opportunity"} required>
            <Select required value={form.linked_id} onChange={event => setForm({ ...form, linked_id: event.target.value })}>
              <option value="">Choose a record</option>
              {form.link_type === "contact" ? contacts.data?.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>) : opportunities.data?.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </Field>
          <Field label="Due date"><Input type="datetime-local" value={form.due_at} onChange={event => setForm({ ...form, due_at: event.target.value })} /></Field>
          <Field label="Description"><Textarea rows={4} maxLength={5000} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></Field>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <FormFooter onCancel={() => setOpen(false)} disabled={saving} submitLabel={saving ? "Saving…" : "Save activity"} />
        </form>
      </Drawer>
    </section>
  );
}
