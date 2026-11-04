"use client";

import { useDeferredValue, useState, type FormEvent } from "react";
import Link from "next/link";
import { Mail, Phone, Plus, Search, UserRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, FormFooter, Input, Select, Textarea } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableScroll } from "@/components/ui/TableScroll";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/lib/auth";
import {
  useCreateCrmContact,
  useCrmContacts,
  useDeleteCrmContact,
  useUpdateCrmContact,
} from "@/lib/api/hooks";
import type { ApiCrmContact } from "@/lib/api";

const EMPTY = {
  name: "",
  tin: "",
  email: "",
  phone: "",
  address: "",
  customer_type: "individual",
};

function messageOf(error: unknown) {
  return (error as { detail?: string })?.detail ?? "Could not save this contact. Please try again.";
}

export default function ContactsPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("contacts:create");
  const canUpdate = hasPermission("contacts:update");
  const canDelete = hasPermission("contacts:delete");
  const canManage = canUpdate || canDelete;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [selected, setSelected] = useState<ApiCrmContact | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [mutationError, setMutationError] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const contacts = useCrmContacts(page, 25, deferredSearch || undefined, kind || undefined);
  const create = useCreateCrmContact();
  const update = useUpdateCrmContact();
  const remove = useDeleteCrmContact();
  const { confirm, dialog } = useConfirmDialog();
  const saving = create.isPending || update.isPending;

  function openCreate() {
    setSelected(null);
    setForm(EMPTY);
    setError("");
    setMutationError("");
    setOpen(true);
  }

  function openEdit(contact: ApiCrmContact) {
    setSelected(contact);
    setForm({
      name: contact.name,
      tin: contact.tin ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      address: contact.address ?? "",
      customer_type: contact.customer_type,
    });
    setError("");
    setMutationError("");
    setOpen(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data: Record<string, string | null> = {
      ...form,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
    };
    if (selected && !form.tin.trim()) delete data.tin;
    const onError = (reason: Error) => setError(messageOf(reason));
    const onSuccess = () => {
      setError("");
      setOpen(false);
      setSelected(null);
    };
    if (selected) update.mutate({ id: selected.id, data }, { onError, onSuccess });
    else create.mutate(data, { onError, onSuccess });
  }

  function deleteContact(contact: ApiCrmContact) {
    confirm({
      title: "Delete contact?",
      message: `Delete ${contact.name}? Related sales records will remain, but the contact link may be removed.`,
      danger: true,
      confirmLabel: "Delete contact",
      onConfirm: () => {
        setMutationError("");
        remove.mutate(contact.id, { onError: reason => setMutationError(messageOf(reason)) });
      },
    });
  }

  return (
    <section className="min-w-0 space-y-4">
      {dialog}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="pesaa-page-title">Contacts</h1>
          <p className="mt-1 text-sm text-muted">Customer records shared with Sales. CRM does not create duplicate contact data.</p>
        </div>
        {canCreate && <Button onClick={openCreate}><Plus size={16} /> Add contact</Button>}
      </header>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
        <label className="relative block">
          <span className="sr-only">Search contacts</span>
          <Search size={16} aria-hidden className="absolute left-3 top-3 text-muted" />
          <Input className="pl-9" placeholder="Search name, email or phone" value={search}
            onChange={event => { setSearch(event.target.value); setPage(1); }} />
        </label>
        <Select aria-label="Filter by contact type" value={kind}
          onChange={event => { setKind(event.target.value); setPage(1); }}>
          <option value="">All contact types</option>
          <option value="individual">Individual</option>
          <option value="business">Business</option>
        </Select>
      </div>

      {mutationError && <p role="alert" className="text-sm text-red-600">{mutationError}</p>}
      {contacts.isLoading ? <PageLoader variant="compact" /> : contacts.isError ? (
        <p role="alert" className="text-sm text-red-600">Could not load CRM contacts. <Button variant="outline" onClick={() => void contacts.refetch()}>Retry</Button></p>
      ) : (
        <>
          <TableScroll label="CRM contacts" mobileLayout="cards">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr>
                <th scope="col" className="text-left">Contact</th>
                <th scope="col" className="text-left">Type</th>
                <th scope="col" className="text-left">Email</th>
                <th scope="col" className="text-left">Phone</th>
                <th scope="col" className="text-left">Status</th>
                {canManage && <th scope="col"><span className="sr-only">Actions</span></th>}
              </tr></thead>
              <tbody>
                {contacts.data?.items.map(contact => (
                  <tr key={contact.id}>
                    <td data-label="Contact">
                      <Link href={`/crm/contacts/${contact.id}`} className="flex items-center gap-2 font-semibold hover:text-accent">
                        <UserRound size={16} aria-hidden className="text-muted" />{contact.name}
                      </Link>
                    </td>
                    <td data-label="Type" className="capitalize">{contact.customer_type}</td>
                    <td data-label="Email">{contact.email ? <a className="inline-flex items-center gap-1 text-accent hover:underline" href={`mailto:${contact.email}`}><Mail size={13} />{contact.email}</a> : <span className="text-muted">—</span>}</td>
                    <td data-label="Phone">{contact.phone ? <a className="inline-flex items-center gap-1 text-accent hover:underline" href={`tel:${contact.phone}`}><Phone size={13} />{contact.phone}</a> : <span className="text-muted">—</span>}</td>
                    <td data-label="Status">{contact.is_active ? "Active" : "Inactive"}</td>
                    {canManage && <td className="text-right">
                      {canUpdate && <Button size="sm" variant="outline" onClick={() => openEdit(contact)}>Edit</Button>}
                      {canDelete && <Button size="sm" variant="ghost" onClick={() => deleteContact(contact)}>Delete</Button>}
                    </td>}
                  </tr>
                ))}
                {contacts.data?.items.length === 0 && <tr><td colSpan={canManage ? 6 : 5} className="py-10 text-center text-muted">No matching contacts.</td></tr>}
              </tbody>
            </table>
          </TableScroll>
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" disabled={page <= 1 || contacts.isFetching} onClick={() => setPage(current => current - 1)}>Previous</Button>
            <span className="text-sm text-muted">Page {page} · {contacts.data?.total ?? 0} contacts</span>
            <Button variant="outline" disabled={contacts.isFetching || page * 25 >= (contacts.data?.total ?? 0)} onClick={() => setPage(current => current + 1)}>Next</Button>
          </div>
        </>
      )}

      <Drawer open={open} onClose={() => setOpen(false)} title={selected ? "Edit contact" : "Add contact"} description="Contact details are shared with the Sales customer directory.">
        <form className="space-y-4 p-4" onSubmit={submit}>
          <Field label="Name" required><Input required maxLength={255} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="TIN" required={!selected || !!selected.tin} hint={!selected ? "Required for every new customer record." : undefined}><Input required={!selected || !!selected.tin} minLength={3} maxLength={50} value={form.tin} onChange={event => setForm({ ...form, tin: event.target.value })} /></Field>
          <Field label="Contact type"><Select value={form.customer_type} onChange={event => setForm({ ...form, customer_type: event.target.value })}><option value="individual">Individual</option><option value="business">Business</option></Select></Field>
          <Field label="Email"><Input type="email" maxLength={255} value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></Field>
          <Field label="Phone"><Input type="tel" maxLength={50} value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></Field>
          <Field label="Address"><Textarea rows={3} value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} /></Field>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <FormFooter onCancel={() => setOpen(false)} disabled={saving} submitLabel={saving ? "Saving…" : "Save contact"} />
        </form>
      </Drawer>
    </section>
  );
}
