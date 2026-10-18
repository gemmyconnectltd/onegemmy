"use client";

import { Building2, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { Field, Input, Select } from "@/components/ui/Form";
import { useCurrentTenant, useUpdateMyTenant } from "@/lib/api/hooks";
import type { Tenant } from "@/lib/api";
import { PageLoader } from "@/components/ui/PageLoader";
import { NotAvailable, SaveBar, SettingsCard } from "@/components/settings/parts";

const URL_RE = /^https?:\/\/\S+\.\S+$/i;

/** Owns the form's local state, initialised from `tenant` — only mounts once `tenant` has loaded. */
function BusinessInfoForm({ tenant }: { tenant: Tenant }) {
  const updateTenant = useUpdateMyTenant();
  const initial = { name: tenant.name ?? "", phone: tenant.phone ?? "", address: tenant.address ?? "", city: tenant.city ?? "", country: tenant.country ?? "", website: tenant.website ?? "", business_type: tenant.business_type ?? "", preferred_contact: tenant.preferred_contact ?? "email" };
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof initial, v: string) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };

  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((k) => form[k].trim() !== initial[k].trim());
  const nameErr = !form.name.trim() ? "Business name is required" : null;
  const webErr = form.website.trim() && !URL_RE.test(form.website.trim()) ? "Use a full address, e.g. https://example.com" : null;

  // Leaving with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (!dirty || nameErr || webErr) return;
    setError(null);
    try {
      await updateTenant.mutateAsync({ id: tenant.id, data: { name: form.name.trim(), phone: form.phone.trim() || null, address: form.address.trim() || null, city: form.city.trim() || null, country: form.country.trim() || null, website: form.website.trim() || null, business_type: form.business_type.trim() || null, preferred_contact: form.preferred_contact === "phone" || form.preferred_contact === "whatsapp" ? form.preferred_contact : "email" } });
      setSaved(true);
    } catch (err: unknown) {
      setError((err as { detail?: string })?.detail ?? "Couldn't save your business information. Try again.");
    }
  };

  return (
    <form onSubmit={save} noValidate className="min-w-0 space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-2">
      <SettingsCard title="Business Information" description="Basic details about your business." icon={Building2}>
      <div className="grid gap-4 py-3 sm:grid-cols-2">
        <Field label="Business name" required><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="My Shop" aria-invalid={!!nameErr} />{nameErr && <p role="alert" className="mt-1 text-[11px] text-red-600">{nameErr}</p>}</Field>
        <Field label="Phone"><Input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+250 7XX XXX XXX" /></Field>
        <Field label="Address" className="sm:col-span-2"><Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="KG 7 Ave" /></Field>
        <Field label="City"><Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Kigali" /></Field>
        <Field label="Country"><Input value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="Rwanda" /></Field>
        <Field label="Preferred contact" hint="How Pesaa support and account staff should reach you first." className="sm:col-span-2">
          <Select value={form.preferred_contact} onChange={(e) => set("preferred_contact", e.target.value)}><option value="email">Email</option><option value="phone">Phone call</option><option value="whatsapp">WhatsApp</option></Select>
        </Field>
        <Field label="Website" className="sm:col-span-2"><Input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://example.com" aria-invalid={!!webErr} />{webErr && <p role="alert" className="mt-1 text-[11px] text-red-600">{webErr}</p>}</Field>
      </div>
      </SettingsCard>
      <SettingsCard title="Business Type & Operations" description="Configure your business type and operational preferences." icon={Store}>
        <div className="py-3"><Field label="Business type"><Input value={form.business_type} onChange={(e) => set("business_type", e.target.value)} placeholder="e.g. Retail" /></Field></div>
        <NotAvailable label="Business registration number (TIN)" hint="Registration details cannot be stored yet." />
        <NotAvailable label="Default branch" hint="Manage your locations in Settings → Branches." />
        <NotAvailable label="Allow online orders" hint="Online ordering preferences are not available yet." />
      </SettingsCard>
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
      <SaveBar dirty={dirty} invalid={!!nameErr || !!webErr} saving={updateTenant.isPending} saved={saved} error={error} onSave={() => void save()} onReset={() => { setForm(initial); setError(null); }} />
      </div>
    </form>
  );
}

export default function GeneralSettingsPage() {
  const { data: tenant } = useCurrentTenant();
  return (
    <div className="space-y-4">
      {tenant ? <BusinessInfoForm tenant={tenant} /> : <PageLoader variant="compact" />}
    </div>
  );
}
