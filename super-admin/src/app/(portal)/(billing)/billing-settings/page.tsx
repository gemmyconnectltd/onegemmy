"use client";

import { useState, type ReactNode } from "react";
import { CheckCircle2, Plug } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Toggle } from "@/components/ui/Toggle";
import { useBilling } from "@/lib/billing/store";
import type { BillingSettings } from "@/lib/billing/types";
import { Notice, PageHeader } from "@/components/billing/ui";

type Errors = Partial<Record<keyof BillingSettings, string>>;
const whole = (v: string) => /^\d{1,4}$/.test(v);

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return <section className="rounded-xl border border-border bg-card p-4"><h2 className="text-sm font-bold">{title}</h2>{hint && <p className="mb-3 mt-0.5 text-[12px] text-muted">{hint}</p>}<div className={`grid gap-4 sm:grid-cols-2 ${hint ? "" : "mt-3"}`}>{children}</div></section>;
}
function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-[13px]"><span>{label}</span><Toggle size="sm" label={label} checked={checked} onChange={onChange} /></div>;
}

export default function BillingSettingsPage() {
  const { state, actions } = useBilling();
  const [s, setS] = useState<BillingSettings>(state!.settings);
  const [txt, setTxt] = useState({ tax: (state!.settings.taxRateBps / 100).toString(), cur: state!.settings.supportedCurrencies.join(", "), xu: state!.settings.extraUserLimit?.toString() ?? "", xb: state!.settings.extraBranchLimit?.toString() ?? "", trial: String(state!.settings.trialDefaultDays), grace: String(state!.settings.gracePeriodDays), due: String(state!.settings.invoiceDueDays), cancel: String(state!.settings.autoCancelAfterDays) });
  const [errors, setErrors] = useState<Errors>({});
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof BillingSettings>(k: K, v: BillingSettings[K]) => { setS((x) => ({ ...x, [k]: v })); setSaved(false); };
  const t = (k: keyof typeof txt, v: string) => { setTxt((x) => ({ ...x, [k]: v })); setSaved(false); };

  const save = () => {
    const e: Errors = {};
    const currencies = txt.cur.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
    if (!currencies.length || currencies.some((c) => !/^[A-Z]{3}$/.test(c))) e.supportedCurrencies = "Comma-separated 3-letter codes";
    else if (!currencies.includes(s.defaultCurrency)) e.defaultCurrency = "Default currency must be in the supported list";
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(txt.tax) && txt.tax !== "100") e.taxRateBps = "0–100";
    if (!/^[A-Za-z0-9-]{1,10}$/.test(s.invoicePrefix)) e.invoicePrefix = "1–10 letters/numbers";
    if (!/^\S+@\S+\.\S+$/.test(s.billingEmail)) e.billingEmail = "Enter a valid email";
    for (const [k, f] of [["invoiceDueDays", "due"], ["trialDefaultDays", "trial"], ["gracePeriodDays", "grace"], ["autoCancelAfterDays", "cancel"]] as const) if (!whole(txt[f])) e[k] = "Whole number of days";
    if (txt.xu && !whole(txt.xu)) e.extraUserLimit = "Whole number or empty";
    if (txt.xb && !whole(txt.xb)) e.extraBranchLimit = "Whole number or empty";
    setErrors(e);
    if (Object.keys(e).length) return;
    actions.saveSettings({ ...s, supportedCurrencies: currencies, taxRateBps: Math.round(Number(txt.tax) * 100), invoiceDueDays: Number(txt.due), trialDefaultDays: Number(txt.trial), gracePeriodDays: Number(txt.grace), autoCancelAfterDays: Number(txt.cancel), extraUserLimit: txt.xu ? Number(txt.xu) : null, extraBranchLimit: txt.xb ? Number(txt.xb) : null });
    setSaved(true);
  };
  const err = (k: keyof BillingSettings) => errors[k] && <p role="alert" className="mt-1 text-[11px] text-red-600 dark:text-red-400">{errors[k]}</p>;

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title="Billing Settings" subtitle="Defaults used when creating subscriptions and invoices. Changes apply going forward — issued invoices never change."
        actions={<>{saved && <span role="status" className="flex items-center gap-1 text-[12px] font-semibold text-emerald-600"><CheckCircle2 size={14} /> Saved</span>}<Button variant="primary" onClick={save}>Save settings</Button></>} />

      <Section title="General">
        <Field label="Default currency"><Input maxLength={3} value={s.defaultCurrency} onChange={(e) => set("defaultCurrency", e.target.value.toUpperCase())} />{err("defaultCurrency")}</Field>
        <Field label="Supported currencies" hint="Amounts are never converted between currencies."><Input value={txt.cur} onChange={(e) => t("cur", e.target.value)} />{err("supportedCurrencies")}</Field>
        <Field label="Tax rate (%)"><Input inputMode="decimal" value={txt.tax} onChange={(e) => t("tax", e.target.value)} />{err("taxRateBps")}</Field>
        <Field label="Tax label"><Input value={s.taxLabel} onChange={(e) => set("taxLabel", e.target.value)} /></Field>
        <Field label="Invoice number prefix"><Input value={s.invoicePrefix} onChange={(e) => set("invoicePrefix", e.target.value)} />{err("invoicePrefix")}</Field>
        <Field label="Invoice due (days after issue)"><Input inputMode="numeric" value={txt.due} onChange={(e) => t("due", e.target.value)} />{err("invoiceDueDays")}</Field>
        <Field label="Billing email" className="sm:col-span-2"><Input type="email" value={s.billingEmail} onChange={(e) => set("billingEmail", e.target.value)} />{err("billingEmail")}</Field>
      </Section>

      <Section title="Subscriptions">
        <Field label="Default trial (days)"><Input inputMode="numeric" value={txt.trial} onChange={(e) => t("trial", e.target.value)} />{err("trialDefaultDays")}</Field>
        <Field label="Grace period after failed payment (days)"><Input inputMode="numeric" value={txt.grace} onChange={(e) => t("grace", e.target.value)} />{err("gracePeriodDays")}</Field>
        <Field label="Auto-cancel unpaid after (days)"><Input inputMode="numeric" value={txt.cancel} onChange={(e) => t("cancel", e.target.value)} />{err("autoCancelAfterDays")}</Field>
        <Field label="Proration on mid-cycle changes"><Select value={s.proration} onChange={(e) => set("proration", e.target.value as BillingSettings["proration"])}><option value="create_prorations">Prorate the difference</option><option value="none">No proration</option></Select></Field>
        <Switch label="Allow annual billing" checked={s.allowAnnual} onChange={(v) => set("allowAnnual", v)} />
      </Section>

      <Section title="Additional users & branches" hint="Extra seats beyond a plan's included users/branches, charged at the plan's per-seat price.">
        <Switch label="Allow additional users" checked={s.extraUsersEnabled} onChange={(v) => set("extraUsersEnabled", v)} />
        <Field label="Max additional users" hint="Empty = unlimited"><Input inputMode="numeric" value={txt.xu} onChange={(e) => t("xu", e.target.value)} />{err("extraUserLimit")}</Field>
        <Switch label="Allow additional branches" checked={s.extraBranchesEnabled} onChange={(v) => set("extraBranchesEnabled", v)} />
        <Field label="Max additional branches" hint="Empty = unlimited"><Input inputMode="numeric" value={txt.xb} onChange={(e) => t("xb", e.target.value)} />{err("extraBranchLimit")}</Field>
      </Section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-bold">Payments provider</h2>
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-dashed border-border p-3 text-[13px]"><Plug size={16} className="text-muted" /><div className="min-w-0 flex-1"><p className="font-semibold">Not connected</p><p className="text-[12px] text-muted">No payment provider is configured. Connection is done on the server; API keys and webhook secrets are never entered or shown in this portal.</p></div></div>
        <div className="mt-3"><Notice tone="blue">Status is read-only here. Once the billing API exists it will report the provider name, mode (test/live) and webhook health — never the credentials.</Notice></div>
      </section>

      <Section title="Notifications" hint="Emails sent to the tenant's billing contact (sent by the backend once it exists).">
        <Switch label="Payment failed" checked={s.notifyPaymentFailed} onChange={(v) => set("notifyPaymentFailed", v)} />
        <Switch label="Invoice issued" checked={s.notifyInvoiceIssued} onChange={(v) => set("notifyInvoiceIssued", v)} />
        <Switch label="Trial ending soon" checked={s.notifyTrialEnding} onChange={(v) => set("notifyTrialEnding", v)} />
        <Switch label="Subscription canceled" checked={s.notifyCanceled} onChange={(v) => set("notifyCanceled", v)} />
      </Section>
    </div>
  );
}
