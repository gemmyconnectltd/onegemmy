"use client";

import { Field, Input, Select } from "@/components/ui/Form";
import { useContactOptions } from "@/lib/marketing/hooks";
import type { ContactFilters } from "@/lib/api";

const first = (v?: string[]) => v?.[0] ?? "";
const arr = (v: string) => (v ? [v] : undefined);

/** One filter form used by the Audience page, the segment builder and the campaign audience step, so a segment means
 *  exactly the same thing everywhere. Empty values are dropped. */
export function AudienceFilters({ value, onChange, showSearch = true }: { value: ContactFilters; onChange: (f: ContactFilters) => void; showSearch?: boolean }) {
  const options = useContactOptions().data;
  const set = (patch: Partial<ContactFilters>) => {
    const next = { ...value, ...patch } as Record<string, unknown>;
    Object.keys(next).forEach((k) => { const v = next[k]; if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) delete next[k]; });
    onChange(next as ContactFilters);
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {showSearch && <Field label="Search" className="sm:col-span-2"><Input value={value.q ?? ""} onChange={(e) => set({ q: e.target.value })} placeholder="Business, name, email or phone" /></Field>}
      <Field label="Country"><Select value={first(value.countries)} onChange={(e) => set({ countries: arr(e.target.value) })}><option value="">All countries</option>{options?.countries.map((c) => <option key={c}>{c}</option>)}</Select></Field>
      <Field label="Subscription plan"><Select value={first(value.plans)} onChange={(e) => set({ plans: arr(e.target.value) })}><option value="">All plans</option>{options?.plans.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
      <Field label="Industry"><Select value={first(value.industries)} onChange={(e) => set({ industries: arr(e.target.value) })}><option value="">All industries</option>{options?.industries.map((c) => <option key={c}>{c}</option>)}</Select></Field>
      <Field label="Tag"><Select value={first(value.tags)} onChange={(e) => set({ tags: arr(e.target.value) })}><option value="">Any tag</option>{options?.tags.map((c) => <option key={c}>{c}</option>)}</Select></Field>
      <Field label="Account activity"><Select value={value.activity ?? ""} onChange={(e) => set({ activity: (e.target.value || undefined) as ContactFilters["activity"] })}>
        <option value="">Any</option><option value="active_30d">Used the ERP in last 30 days</option><option value="inactive_30d">Quiet for 30+ days</option><option value="never">Never used the ERP</option></Select></Field>
      <Field label="Marketing consent"><Select value={value.consent ?? ""} onChange={(e) => set({ consent: (e.target.value || undefined) as ContactFilters["consent"] })}>
        <option value="">Any</option><option value="subscribed">Consent recorded</option><option value="unknown">No consent recorded</option></Select></Field>
      <Field label="Newsletter"><Select value={value.newsletter === undefined ? "" : String(value.newsletter)} onChange={(e) => set({ newsletter: e.target.value === "" ? undefined : e.target.value === "true" })}>
        <option value="">Any</option><option value="true">Subscribed</option><option value="false">Not subscribed</option></Select></Field>
      <Field label="Account status"><Select value={value.account_status ?? ""} onChange={(e) => set({ account_status: (e.target.value || undefined) as ContactFilters["account_status"] })}>
        <option value="">Any</option><option value="active">Active accounts</option><option value="suspended">Suspended accounts</option></Select></Field>
      <Field label="Contact preference"><Select value={value.preferred_contact ?? ""} onChange={(e) => set({ preferred_contact: (e.target.value || undefined) as ContactFilters["preferred_contact"] })}>
        <option value="">Any</option><option value="email">Email</option><option value="phone">Phone call</option><option value="whatsapp">WhatsApp</option></Select></Field>
      <Field label="Source"><Select value={first(value.sources)} onChange={(e) => set({ sources: arr(e.target.value) })}>
        <option value="">Any</option><option value="tenant">Business accounts</option><option value="import">Imported</option><option value="manual">Added manually</option></Select></Field>
      <Field label="Contact status"><Select value={value.status ?? ""} onChange={(e) => set({ status: (e.target.value || undefined) as ContactFilters["status"] })}>
        <option value="">Any</option><option value="active">Active</option><option value="unsubscribed">Unsubscribed</option><option value="bounced">Bounced</option><option value="complained">Complained</option><option value="invalid">Invalid</option></Select></Field>
      <Field label="Registered from"><Input type="date" value={value.registered_from ?? ""} onChange={(e) => set({ registered_from: e.target.value || undefined })} /></Field>
      <Field label="Registered to"><Input type="date" value={value.registered_to ?? ""} onChange={(e) => set({ registered_to: e.target.value || undefined })} /></Field>
    </div>
  );
}

export const activeFilterCount = (f: ContactFilters) => Object.entries(f).filter(([k, v]) => k !== "q" && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)).length;
