"use client";

import { useDeferredValue, useState, type FormEvent } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, FormFooter, Input, Select } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableScroll } from "@/components/ui/TableScroll";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/lib/auth";
import {
  useCreateCrmCampaign, useCrmCampaigns, useDeleteCrmCampaign, useUpdateCrmCampaign,
} from "@/lib/api/hooks";
import type { ApiCampaign } from "@/lib/api";

const EMPTY = { name: "", type: "Email", status: "Draft", start_date: "", target_count: "0", sent_count: "0", opened_count: "0" };
const TYPES = ["Email", "SMS", "Social"];
const STATUSES = ["Draft", "Active", "Paused", "Completed"];
const errorText = (error: unknown) => (error as { detail?: string })?.detail ?? "Could not save this campaign.";

export default function CampaignsPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("campaigns:create");
  const canUpdate = hasPermission("campaigns:update");
  const canDelete = hasPermission("campaigns:delete");
  const canManage = canUpdate || canDelete;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApiCampaign | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const campaigns = useCrmCampaigns(page, 25, deferredSearch || undefined, status || undefined);
  const create = useCreateCrmCampaign();
  const update = useUpdateCrmCampaign();
  const remove = useDeleteCrmCampaign();
  const { confirm, dialog } = useConfirmDialog();
  const saving = create.isPending || update.isPending;

  function startCreate() {
    setEditing(null); setForm(EMPTY); setError(""); setOpen(true);
  }
  function startEdit(item: ApiCampaign) {
    setEditing(item);
    setForm({
      name: item.name, type: item.type, status: item.status,
      start_date: item.start_date ?? "", target_count: String(item.target_count),
      sent_count: String(item.sent_count), opened_count: String(item.opened_count),
    });
    setError(""); setOpen(true);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = {
      name: form.name.trim(), type: form.type, status: form.status,
      start_date: form.start_date || null, target_count: Number(form.target_count),
      sent_count: Number(form.sent_count), opened_count: Number(form.opened_count),
    };
    const onError = (reason: Error) => setError(errorText(reason));
    const onSuccess = () => { setOpen(false); setError(""); };
    if (editing) update.mutate({ id: editing.id, data }, { onError, onSuccess });
    else create.mutate(data, { onError, onSuccess });
  }
  function confirmDelete(item: ApiCampaign) {
    confirm({
      title: "Delete campaign?",
      message: `Delete "${item.name}"? Email history linked to this campaign will no longer be grouped here.`,
      danger: true, confirmLabel: "Delete campaign",
      onConfirm: () => remove.mutate(item.id, { onError: reason => setError(errorText(reason)) }),
    });
  }

  return (
    <section className="min-w-0 space-y-4">
      {dialog}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="pesaa-page-title">Campaigns</h1>
          <p className="mt-1 text-sm text-muted">Track campaign details and manually recorded results. This screen does not send messages.</p>
        </div>
        {canCreate && <Button onClick={startCreate}><Plus size={16} /> New campaign</Button>}
      </header>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
        <label className="relative block"><span className="sr-only">Search campaigns</span><Search size={16} aria-hidden className="absolute left-3 top-3 text-muted" />
          <Input className="pl-9" placeholder="Search campaigns" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />
        </label>
        <Select aria-label="Filter campaigns by status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
          <option value="">All statuses</option>{STATUSES.map(item => <option key={item} value={item}>{item}</option>)}
        </Select>
      </div>
      {error && !open && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {campaigns.isLoading ? <PageLoader variant="compact" /> : campaigns.isError ? (
        <p role="alert" className="text-sm text-red-600">Could not load CRM campaigns. <Button variant="outline" onClick={() => void campaigns.refetch()}>Retry</Button></p>
      ) : (
        <>
          <TableScroll label="CRM campaigns" mobileLayout="cards">
            <table className="w-full min-w-[700px] text-sm">
              <thead><tr><th scope="col" className="text-left">Campaign</th><th scope="col" className="text-left">Type</th><th scope="col" className="text-left">Start date</th><th scope="col" className="text-right">Target</th><th scope="col" className="text-right">Sent</th><th scope="col" className="text-right">Opened</th><th scope="col" className="text-left">Status</th>{canManage && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
              <tbody>
                {campaigns.data?.items.map(item => (
                  <tr key={item.id}>
                    <td data-label="Campaign" className="font-semibold">{item.name}</td>
                    <td data-label="Type">{item.type}</td>
                    <td data-label="Start date">{item.start_date ?? "—"}</td>
                    <td data-label="Target" className="text-right">{item.target_count}</td>
                    <td data-label="Sent" className="text-right">{item.sent_count}</td>
                    <td data-label="Opened" className="text-right">{item.opened_count}</td>
                    <td data-label="Status">{item.status}</td>
                    {canManage && <td className="text-right whitespace-nowrap">
                      {canUpdate && <Button size="sm" variant="outline" onClick={() => startEdit(item)}>Edit</Button>}
                      {canDelete && <Button size="sm" variant="ghost" onClick={() => confirmDelete(item)}>Delete</Button>}
                    </td>}
                  </tr>
                ))}
                {campaigns.data?.items.length === 0 && <tr><td colSpan={canManage ? 8 : 7} className="py-10 text-center text-muted">No matching campaigns.</td></tr>}
              </tbody>
            </table>
          </TableScroll>
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" disabled={page <= 1 || campaigns.isFetching} onClick={() => setPage(current => current - 1)}>Previous</Button>
            <span className="text-sm text-muted">Page {page} · {campaigns.data?.total ?? 0} campaigns</span>
            <Button variant="outline" disabled={campaigns.isFetching || page * 25 >= (campaigns.data?.total ?? 0)} onClick={() => setPage(current => current + 1)}>Next</Button>
          </div>
        </>
      )}
      <Drawer open={open} onClose={() => setOpen(false)} title={editing ? "Edit campaign" : "New campaign"} size="md">
        <form className="space-y-4 p-4" onSubmit={submit}>
          <Field label="Campaign name" required><Input required maxLength={255} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Channel"><Select value={form.type} onChange={event => setForm({ ...form, type: event.target.value })}>{[...new Set([...TYPES, form.type])].map(item => <option key={item}>{item}</option>)}</Select></Field>
            <Field label="Status"><Select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}>{[...new Set([...STATUSES, form.status])].map(item => <option key={item}>{item}</option>)}</Select></Field>
            <Field label="Start date"><Input type="date" value={form.start_date} onChange={event => setForm({ ...form, start_date: event.target.value })} /></Field>
            <Field label="Target count"><Input type="number" min="0" step="1" value={form.target_count} onChange={event => setForm({ ...form, target_count: event.target.value })} /></Field>
            <Field label="Sent count"><Input type="number" min="0" step="1" value={form.sent_count} onChange={event => setForm({ ...form, sent_count: event.target.value })} /></Field>
            <Field label="Opened count"><Input type="number" min="0" step="1" value={form.opened_count} onChange={event => setForm({ ...form, opened_count: event.target.value })} /></Field>
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <FormFooter onCancel={() => setOpen(false)} disabled={saving} submitLabel={saving ? "Saving…" : "Save campaign"} />
        </form>
      </Drawer>
    </section>
  );
}
