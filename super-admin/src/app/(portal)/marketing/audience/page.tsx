"use client";

import { useMemo, useState } from "react";
import { Download, Filter, Loader2, MessageSquare, Plus, Save, Trash2, Upload } from "lucide-react";
import { marketingApi, type BulkAction, type Contact, type ContactFilters } from "@/lib/api";
import { errorText, useAudienceSummary, useContacts, useMarketingMutation, useSegments } from "@/lib/marketing/hooks";
import { fmtRelative } from "@/lib/date";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataCard, Pagination, SearchBox, SortHeader, thClass } from "@/components/ui/DataTable";
import { Field, Input, Select } from "@/components/ui/Form";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { OutreachDrawer } from "@/components/support/OutreachDrawer";
import { AudienceFilters, activeFilterCount } from "@/components/marketing/AudienceFilters";
import { ContactDrawer } from "@/components/marketing/ContactDrawer";
import { ImportDrawer } from "@/components/marketing/ImportDrawer";
import { CONTACT_STATUS, Flash, num } from "@/components/marketing/shared";
import { downloadCsv } from "@/components/traffic/shared";

const PAGE_SIZE = 25;
type Sort = "name" | "created" | "email" | "last_active";
type Pending = { action: BulkAction; title: string; message: string; danger?: boolean } | null;

export default function MarketingAudiencePage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<ContactFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<{ key: Sort; dir: "asc" | "desc" }>({ key: "created", dir: "desc" });
  const [selected, setSelected] = useState<Map<string, Contact>>(new Map());
  const [allMatching, setAllMatching] = useState(false);
  const [profile, setProfile] = useState<string | null>(null);
  const [composing, setComposing] = useState<{ id: string; name: string }[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [segmentName, setSegmentName] = useState("");
  const [bulkInput, setBulkInput] = useState<Pending>(null);
  const [tagValue, setTagValue] = useState("");
  const [consentSource, setConsentSource] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  const contacts = useContacts(page, PAGE_SIZE, filters, sort.key, sort.dir);
  const summary = useAudienceSummary(filters);
  const segments = useSegments();
  const bulk = useMarketingMutation((v: Parameters<typeof marketingApi.bulk>[0]) => marketingApi.bulk(v).then((r) => r.data));
  const saveSegment = useMarketingMutation((v: { name: string }) => marketingApi.saveSegment(null, { name: v.name, filters }));
  const deleteSegment = useMarketingMutation((id: string) => marketingApi.deleteSegment(id));

  const rows = contacts.data?.items ?? [];
  const total = contacts.data?.total ?? 0;
  const setF = (f: ContactFilters) => { setFilters(f); setPage(1); setSelected(new Map()); setAllMatching(false); };
  const toggle = (c: Contact) => setSelected((m) => { const n = new Map(m); if (n.has(c.id)) n.delete(c.id); else n.set(c.id, c); return n; });
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const togglePage = () => setSelected((m) => { const n = new Map(m); rows.forEach((r) => (allOnPage ? n.delete(r.id) : n.set(r.id, r))); return n; });
  const count = allMatching ? total : selected.size;
  const sortBy = (key: Sort) => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));
  const activeSegment = useMemo(() => segments.data?.find((s) => JSON.stringify(s.filters) === JSON.stringify(filters)), [segments.data, filters]);

  const apply = async (action: BulkAction, extra: { tags?: string[]; consent_source?: string; reason?: string } = {}) => {
    setMsg(null);
    try {
      const r = await bulk.mutateAsync({ ...(allMatching ? { all_matching: true, filters } : { ids: [...selected.keys()] }), action, ...extra });
      setMsg({ tone: "ok", text: `${r.changed.toLocaleString()} of ${r.selected.toLocaleString()} contacts updated.` });
      setSelected(new Map()); setAllMatching(false); setBulkInput(null); setPending(null); setTagValue(""); setConsentSource("");
    } catch (e) { setMsg({ tone: "error", text: errorText(e) }); setPending(null); }
  };
  const [pending, setPending] = useState<Pending>(null);

  const exportCsv = async () => {
    setExporting(true); setMsg(null);
    try {
      const all: Contact[] = [];
      for (let p = 1; ; p++) { const res = await marketingApi.contacts(p, 100, filters, sort.key, sort.dir); all.push(...res.data.items); if (all.length >= res.data.total || !res.data.items.length) break; }
      downloadCsv(`pesaa_contacts_${new Date().toISOString().slice(0, 10)}.csv`, [
        ["Business", "Name", "Email", "Phone", "Country", "Plan", "Industry", "Source", "Status", "Eligible for marketing", "Consent", "Consent source", "Newsletter", "Tags", "Registered", "Last active"],
        ...all.map((c) => [c.business_name, c.name, c.email, c.phone, c.country, c.plan, c.industry, c.source, c.status, c.eligible ? "yes" : "no", c.consent, c.consent_source, c.newsletter_subscribed ? "yes" : "no", c.tags.join(";"), c.registered_at?.slice(0, 10), c.last_active_at?.slice(0, 10) ?? ""]),
      ]);
    } catch { setMsg({ tone: "error", text: "Export failed. Please try again." }); }
    setExporting(false);
  };

  const tenantTargets = [...selected.values()].filter((c) => c.tenant_id && c.status === "active").map((c) => ({ id: c.tenant_id!, name: c.business_name ?? c.email }));
  const s = summary.data;

  return (
    <div className="space-y-4">
      <PageHeader title="Audience" subtitle="Everyone you can email: businesses on Pesaa and imported contacts, with consent and subscription status."
        actions={<><Button variant="outline" onClick={exportCsv} disabled={exporting || !total}>{exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export CSV</Button>
          <Button variant="outline" onClick={() => setImporting(true)}><Upload size={14} /> Import</Button><Button onClick={() => setAdding(true)}><Plus size={14} /> Add contact</Button></>} />

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={filters.q ?? ""} onChange={(v) => setF({ ...filters, q: v || undefined })} placeholder="Search business, name, email or phone" />
        <Select aria-label="Segment" className="w-auto!" value={activeSegment?.id ?? ""} onChange={(e) => setF(segments.data?.find((x) => x.id === e.target.value)?.filters ?? {})}>
          <option value="">{activeFilterCount(filters) || filters.q ? "Custom filters" : "All contacts"}</option>{segments.data?.map((x) => <option key={x.id} value={x.id}>{x.name} ({num(x.eligible)})</option>)}
        </Select>
        <Button variant="outline" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}><Filter size={14} /> Filters{activeFilterCount(filters) ? ` (${activeFilterCount(filters)})` : ""}</Button>
        {(activeFilterCount(filters) > 0 || filters.q) && <><Button variant="ghost" onClick={() => setF({})}>Clear</Button>
          {!activeSegment && <Button variant="outline" onClick={() => setSaving(true)}><Save size={14} /> Save as segment</Button>}</>}
        {activeSegment && <Button variant="ghost" aria-label={`Delete segment ${activeSegment.name}`} onClick={() => deleteSegment.mutate(activeSegment.id, { onSuccess: () => setF({}) })}><Trash2 size={14} /> Delete segment</Button>}
      </div>
      {showFilters && <div className="rounded-xl border border-border bg-card p-4"><AudienceFilters value={filters} onChange={setF} showSearch={false} /></div>}

      {s && <p className="text-[12.5px] text-muted" aria-live="polite"><span className="font-semibold text-foreground">{num(s.matched)}</span> contacts match · <span className="font-semibold text-foreground">{num(s.eligible)}</span> can receive marketing
        {s.matched > s.eligible && <> · excluded: {[s.excluded.unsubscribed && `${num(s.excluded.unsubscribed)} unsubscribed`, s.excluded.bounced_or_complained && `${num(s.excluded.bounced_or_complained)} bounced/complained`, s.excluded.invalid_email && `${num(s.excluded.invalid_email)} invalid or test address`, s.excluded.suspended_account && `${num(s.excluded.suspended_account)} suspended`, s.excluded.no_consent && `${num(s.excluded.no_consent)} no consent`].filter(Boolean).join(", ")}</>}</p>}

      {count > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-sm font-medium">{count.toLocaleString()} selected</p>
          {!allMatching && selected.size === rows.length && total > rows.length && <button type="button" className="text-[12px] font-semibold text-accent hover:underline" onClick={() => setAllMatching(true)}>Select all {total.toLocaleString()} matching</button>}
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setBulkInput({ action: "add_tags", title: "Add tags", message: "" })}>Add tag</Button>
            <Button size="sm" variant="outline" onClick={() => setBulkInput({ action: "remove_tags", title: "Remove tags", message: "" })}>Remove tag</Button>
            <Button size="sm" variant="outline" onClick={() => setBulkInput({ action: "consent", title: "Record marketing consent", message: "" })}>Record consent</Button>
            <Button size="sm" variant="outline" onClick={() => setBulkInput({ action: "newsletter_on", title: "Subscribe to the newsletter", message: "" })}>Subscribe to newsletter</Button>
            <Button size="sm" variant="outline" onClick={() => setPending({ action: "newsletter_off", title: "Unsubscribe from the newsletter", message: `${count.toLocaleString()} contacts will stop receiving the newsletter.` })}>Unsubscribe from newsletter</Button>
            <Button size="sm" variant="outline" onClick={() => setPending({ action: "suppress", title: "Suppress contacts", message: `${count.toLocaleString()} contacts will no longer receive any marketing email. You can reactivate them later.`, danger: true })}>Suppress</Button>
            {!allMatching && tenantTargets.length > 0 && <Button size="sm" onClick={() => setComposing(tenantTargets)}><MessageSquare size={13} /> Message {tenantTargets.length}</Button>}
            <Button size="sm" variant="ghost" onClick={() => { setSelected(new Map()); setAllMatching(false); }}>Clear</Button>
          </div>
        </div>
      )}
      {msg && <Flash tone={msg.tone}>{msg.text}</Flash>}

      {contacts.isLoading ? <PageLoader variant="compact" /> : contacts.isError ? <ErrorState message="Could not load contacts." onRetry={() => void contacts.refetch()} /> : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card"><EmptyState title="No contacts match" description="Try clearing a filter, or import a list of contacts." /></div>
      ) : (
        <DataCard label="Contacts">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead><tr className="border-b border-border bg-surface/50">
              <th scope="col" className="w-10 px-4 py-3"><input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={togglePage} className="h-4 w-4 rounded" /></th>
              <SortHeader label="Contact" active={sort.key === "name"} dir={sort.dir} onClick={() => sortBy("name")} />
              <th scope="col" className={thClass}>Country · Plan</th><th scope="col" className={thClass}>Consent</th><th scope="col" className={thClass}>Status</th><th scope="col" className={thClass}>Tags</th>
              <SortHeader label="Last active" active={sort.key === "last_active"} dir={sort.dir} onClick={() => sortBy("last_active")} />
            </tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-surface/40" onClick={() => setProfile(c.id)}>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${c.business_name ?? c.email}`} checked={allMatching || selected.has(c.id)} disabled={allMatching} onChange={() => toggle(c)} className="h-4 w-4 rounded" /></td>
                  <td className="max-w-[260px] px-4 py-3"><button type="button" className="block max-w-full truncate text-left font-semibold hover:text-accent hover:underline" onClick={(e) => { e.stopPropagation(); setProfile(c.id); }}>{c.business_name ?? c.name ?? c.email}</button>
                    <span className="block truncate text-[12px] text-muted">{c.name && c.business_name ? `${c.name} · ` : ""}{c.email}</span></td>
                  <td className="px-4 py-3 text-[12.5px]"><span className="text-muted">{c.country ?? "—"}</span>{c.plan && <span className="block capitalize">{c.plan}</span>}</td>
                  <td className="px-4 py-3 text-[12px]">{c.consent === "subscribed" ? <Badge tone="green">Recorded</Badge> : <span className="text-muted">None</span>}{c.newsletter_subscribed && <Badge tone="blue" className="ml-1">Newsletter</Badge>}</td>
                  <td className="px-4 py-3"><Badge tone={CONTACT_STATUS[c.status].tone}>{CONTACT_STATUS[c.status].label}</Badge>{!c.eligible && c.status === "active" && <span className="mt-0.5 block text-[11px] text-muted">{c.email_valid ? "Not eligible" : (c.invalid_reason ?? "Invalid email")}</span>}</td>
                  <td className="max-w-[160px] px-4 py-3"><div className="flex flex-wrap gap-1">{c.tags.slice(0, 3).map((t) => <span key={t} className="rounded bg-surface px-1.5 py-0.5 text-[11px] font-medium">{t}</span>)}{c.tags.length > 3 && <span className="text-[11px] text-muted">+{c.tags.length - 3}</span>}</div></td>
                  <td className="px-4 py-3 text-[12px] text-muted">{c.last_active_at ? fmtRelative(c.last_active_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} noun="contact" />

      <ContactDrawer id={profile} onClose={() => setProfile(null)} onMessage={(c) => setComposing([c])} />
      <ImportDrawer open={importing} onClose={() => setImporting(false)} />
      {composing && <OutreachDrawer recipients={composing} onClose={() => setComposing(null)} onDone={() => setSelected(new Map())} />}
      <AddContact open={adding} onClose={() => setAdding(false)} />

      <Drawer open={saving} onClose={() => setSaving(false)} side="center" size="sm" title="Save as segment" description="A segment is a saved set of filters you can reuse for campaigns. It updates as contacts change."
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setSaving(false)}>Cancel</Button><Button disabled={!segmentName.trim() || saveSegment.isPending} onClick={() => saveSegment.mutate({ name: segmentName }, { onSuccess: () => { setSaving(false); setSegmentName(""); setMsg({ tone: "ok", text: "Segment saved." }); }, onError: (e) => setMsg({ tone: "error", text: errorText(e) }) })}>Save segment</Button></div>}>
        <div className="p-5"><Field label="Segment name" required><Input value={segmentName} onChange={(e) => setSegmentName(e.target.value)} maxLength={120} autoFocus /></Field></div>
      </Drawer>

      <Drawer open={!!bulkInput} onClose={() => setBulkInput(null)} side="center" size="sm" title={bulkInput?.title} description={`${count.toLocaleString()} contacts selected`}
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setBulkInput(null)}>Cancel</Button>
          <Button disabled={bulk.isPending || (bulkInput?.action === "consent" ? consentSource.trim().length < 3 : bulkInput?.action === "newsletter_on" ? false : !tagValue.trim())}
            onClick={() => bulkInput && apply(bulkInput.action, bulkInput.action === "consent" || bulkInput.action === "newsletter_on" ? { consent_source: consentSource.trim() || undefined } : { tags: tagValue.split(",").map((t) => t.trim()).filter(Boolean) })}>Apply</Button></div>}>
        <div className="space-y-3 p-5">
          {bulkInput && (bulkInput.action === "add_tags" || bulkInput.action === "remove_tags") && <Field label="Tags" hint="Separate several tags with commas."><Input value={tagValue} onChange={(e) => setTagValue(e.target.value)} autoFocus /></Field>}
          {bulkInput && (bulkInput.action === "consent" || bulkInput.action === "newsletter_on") && <Field label="Where was consent given?" required={bulkInput.action === "consent"} hint="Kept as the consent source in the audit trail."><Input value={consentSource} onChange={(e) => setConsentSource(e.target.value)} maxLength={100} autoFocus /></Field>}
          {bulkInput?.action === "newsletter_on" && <p className="text-[12px] text-muted">Only contacts who are not suppressed are subscribed. Make sure these people asked to receive the newsletter.</p>}
        </div>
      </Drawer>
      <ConfirmDialog open={!!pending} title={pending?.title ?? ""} message={pending?.message ?? ""} danger={pending?.danger} confirmLabel="Apply" onCancel={() => setPending(null)} onConfirm={() => pending && apply(pending.action, pending.action === "suppress" ? { reason: "Suppressed by an admin from Audience" } : {})} />
    </div>
  );
}

function AddContact({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ email: "", name: "", business_name: "", phone: "", country: "", consent_source: "" });
  const [error, setError] = useState("");
  const add = useMarketingMutation(() => marketingApi.addContact({ ...f, tags: [] }));
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((v) => ({ ...v, [k]: e.target.value }));
  return (
    <Drawer open={open} onClose={onClose} side="center" size="md" title="Add contact" description="Someone who agreed to hear from you. Invalid and test addresses are rejected."
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={add.isPending || !f.email || f.consent_source.trim().length < 3}
        onClick={async () => { setError(""); try { await add.mutateAsync(undefined as never); setF({ email: "", name: "", business_name: "", phone: "", country: "", consent_source: "" }); onClose(); } catch (e) { setError(errorText(e)); } }}>Add contact</Button></div>}>
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        <Field label="Email" required className="sm:col-span-2"><Input type="email" value={f.email} onChange={set("email")} autoFocus /></Field>
        <Field label="Name"><Input value={f.name} onChange={set("name")} /></Field><Field label="Business"><Input value={f.business_name} onChange={set("business_name")} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={set("phone")} /></Field><Field label="Country"><Input value={f.country} onChange={set("country")} /></Field>
        <Field label="Where did they agree to hear from you?" required className="sm:col-span-2"><Input value={f.consent_source} onChange={set("consent_source")} maxLength={100} /></Field>
        {error && <div className="sm:col-span-2"><Flash tone="error">{error}</Flash></div>}
      </div>
    </Drawer>
  );
}
