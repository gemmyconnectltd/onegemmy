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
  useCreateCrmOpportunity, useCrmContacts, useCrmOpportunities,
  useDeleteCrmOpportunity, useUpdateCrmOpportunity,
} from "@/lib/api/hooks";
import type { ApiCrmOpportunity } from "@/lib/api";
import { fmtMoney } from "@/lib/config";
import { useAppConfig } from "@/lib/appConfig";

const STAGES = ["Leads", "Qualified", "Proposal", "Negotiation", "Closed Won", "Closed Lost"];
const EMPTY = { name: "", customer_id: "", value: "0", stage: "Leads", probability: "50", expected_close_date: "", notes: "" };
const errorText = (error: unknown) => (error as { detail?: string })?.detail ?? "Could not save this opportunity.";

export default function OpportunitiesPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("opportunities:create");
  const canUpdate = hasPermission("opportunities:update");
  const canDelete = hasPermission("opportunities:delete");
  const canManage = canUpdate || canDelete;
  const { currencySymbol } = useAppConfig();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApiCrmOpportunity | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const opportunities = useCrmOpportunities(page, 25, stage || undefined, deferredSearch || undefined);
  const contacts = useCrmContacts(1, 25, contactSearch.trim() || undefined);
  const create = useCreateCrmOpportunity();
  const update = useUpdateCrmOpportunity();
  const remove = useDeleteCrmOpportunity();
  const { confirm, dialog } = useConfirmDialog();
  const saving = create.isPending || update.isPending;

  function startCreate() {
    setEditing(null); setForm(EMPTY); setContactSearch(""); setError(""); setOpen(true);
  }
  function startEdit(item: ApiCrmOpportunity) {
    setEditing(item);
    setContactSearch(item.customer?.name ?? "");
    setForm({
      name: item.name, customer_id: item.customer_id ?? "", value: String(item.value),
      stage: item.stage, probability: String(item.probability),
      expected_close_date: item.expected_close_date ?? "", notes: item.notes ?? "",
    });
    setError(""); setOpen(true);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = {
      name: form.name.trim(), customer_id: form.customer_id || null,
      value: Number(form.value), stage: form.stage, probability: Number(form.probability),
      expected_close_date: form.expected_close_date || null, notes: form.notes.trim() || null,
    };
    const onError = (reason: Error) => setError(errorText(reason));
    const onSuccess = () => { setOpen(false); setError(""); };
    if (editing) update.mutate({ id: editing.id, data }, { onError, onSuccess });
    else create.mutate(data, { onError, onSuccess });
  }
  function confirmDelete(item: ApiCrmOpportunity) {
    confirm({
      title: "Delete opportunity?",
      message: `Delete "${item.name}"? This removes the shared Sales deal record, but not its customer or orders.`,
      danger: true, confirmLabel: "Delete opportunity",
      onConfirm: () => remove.mutate(item.id),
    });
  }

  return (
    <section className="min-w-0 space-y-4">
      {dialog}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="pesaa-page-title">Opportunities</h1>
          <p className="mt-1 text-sm text-muted">Track prospects through the shared Sales pipeline.</p>
        </div>
        {canCreate && <Button onClick={startCreate}><Plus size={16} /> New opportunity</Button>}
      </header>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
        <label className="relative block">
          <span className="sr-only">Search opportunities</span>
          <Search size={16} aria-hidden className="absolute left-3 top-3 text-muted" />
          <Input className="pl-9" placeholder="Search opportunities or contacts" value={search}
            onChange={event => { setSearch(event.target.value); setPage(1); }} />
        </label>
        <Select aria-label="Filter opportunities by stage" value={stage}
          onChange={event => { setStage(event.target.value); setPage(1); }}>
          <option value="">All stages</option>
          {[...new Set([...STAGES, stage].filter(Boolean))].map(item => <option key={item} value={item}>{item}</option>)}
        </Select>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {opportunities.isLoading ? <PageLoader variant="compact" /> : opportunities.isError ? (
        <p role="alert" className="text-sm text-red-600">Could not load opportunities. <Button variant="outline" onClick={() => void opportunities.refetch()}>Retry</Button></p>
      ) : (
        <>
          <TableScroll label="CRM opportunities" mobileLayout="cards">
            <table className="w-full min-w-[700px] text-sm">
              <thead><tr>
                <th scope="col" className="text-left">Opportunity</th>
                <th scope="col" className="text-left">Contact</th>
                <th scope="col" className="text-left">Stage</th>
                <th scope="col" className="text-right">Value</th>
                <th scope="col" className="text-right">Probability</th>
                <th scope="col" className="text-left">Close date</th>
                {canManage && <th scope="col"><span className="sr-only">Actions</span></th>}
              </tr></thead>
              <tbody>
                {opportunities.data?.items.map(item => (
                  <tr key={item.id}>
                    <td data-label="Opportunity" className="font-semibold">{item.name}</td>
                    <td data-label="Contact">{item.customer?.name ?? <span className="text-muted">Unlinked</span>}</td>
                    <td data-label="Stage">{item.stage}</td>
                    <td data-label="Value" className="text-right">{fmtMoney(item.value, currencySymbol)}</td>
                    <td data-label="Probability" className="text-right">{item.probability}%</td>
                    <td data-label="Close date">{item.expected_close_date ?? "—"}</td>
                    {canManage && <td className="text-right whitespace-nowrap">
                      {canUpdate && <Button size="sm" variant="outline" onClick={() => startEdit(item)}>Edit</Button>}
                      {canDelete && <Button size="sm" variant="ghost" onClick={() => confirmDelete(item)}>Delete</Button>}
                    </td>}
                  </tr>
                ))}
                {opportunities.data?.items.length === 0 && <tr><td colSpan={canManage ? 7 : 6} className="py-10 text-center text-muted">No matching opportunities.</td></tr>}
              </tbody>
            </table>
          </TableScroll>
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" disabled={page <= 1 || opportunities.isFetching} onClick={() => setPage(current => current - 1)}>Previous</Button>
            <span className="text-sm text-muted">Page {page} · {opportunities.data?.total ?? 0} opportunities</span>
            <Button variant="outline" disabled={opportunities.isFetching || page * 25 >= (opportunities.data?.total ?? 0)} onClick={() => setPage(current => current + 1)}>Next</Button>
          </div>
        </>
      )}
      <Drawer open={open} onClose={() => setOpen(false)} title={editing ? "Edit opportunity" : "New opportunity"} size="lg">
        <form className="space-y-4 p-4" onSubmit={submit}>
          <Field label="Opportunity name" required><Input required maxLength={255} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="Find a contact"><Input placeholder="Search customer records" value={contactSearch} onChange={event => setContactSearch(event.target.value)} /></Field>
          <Field label="Linked contact"><Select value={form.customer_id} onChange={event => setForm({ ...form, customer_id: event.target.value })}>
            <option value="">No contact linked</option>
            {contacts.data?.items.map(contact => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
          </Select></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Opportunity value (${currencySymbol})`}><Input type="number" min="0" step="0.01" value={form.value} onChange={event => setForm({ ...form, value: event.target.value })} /></Field>
            <Field label="Stage"><Select value={form.stage} onChange={event => setForm({ ...form, stage: event.target.value })}>{[...new Set([...STAGES, form.stage])].map(item => <option key={item}>{item}</option>)}</Select></Field>
            <Field label="Probability (%)"><Input type="number" min="0" max="100" value={form.probability} onChange={event => setForm({ ...form, probability: event.target.value })} /></Field>
            <Field label="Expected close date"><Input type="date" value={form.expected_close_date} onChange={event => setForm({ ...form, expected_close_date: event.target.value })} /></Field>
          </div>
          <Field label="Notes"><Textarea rows={4} maxLength={5000} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></Field>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <FormFooter onCancel={() => setOpen(false)} disabled={saving} submitLabel={saving ? "Saving…" : "Save opportunity"} />
        </form>
      </Drawer>
    </section>
  );
}
