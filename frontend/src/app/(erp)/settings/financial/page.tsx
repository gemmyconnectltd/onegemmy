"use client";

import { ReceiptText, Info } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAppConfig } from "@/lib/appConfig";
import { useCurrentTenant, useUpdateMyTenant, useVatRate } from "@/lib/api/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { Toggle } from "@/components/ui/Toggle";
import { FinancialSettings } from "@/components/settings/FinancialSettings";
import { SaveBar, SettingRow, SettingsCard } from "@/components/settings/parts";
import { Input, Select } from "@/components/ui/Form";
import { useAuth } from "@/lib/auth";
import type { Tenant } from "@/lib/api";
import { fmtMoney } from "@/lib/config";

/** The most NEW credit one customer may be granted per day (base currency). Only someone with credit:approve
 *  (General Manager/CEO) can change it; everyone else sees the value. Blank = no limit. */
function CreditLimitCard({ tenant, canEdit, symbol }: { tenant: Tenant; canEdit: boolean; symbol: string }) {
  const updateTenant = useUpdateMyTenant();
  const current = tenant.credit_daily_limit == null ? "" : String(Number(tenant.credit_daily_limit));
  const [value, setValue] = useState(current);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = value.trim() !== current;
  const invalid = value.trim() !== "" && !/^\d+(\.\d{1,2})?$/.test(value.trim());

  const save = async () => {
    setError(null);
    try {
      await updateTenant.mutateAsync({ id: tenant.id, data: { credit_daily_limit: value.trim() === "" ? null : Number(value) } });
      setSaved(true);
    } catch (err) {
      setError((err as { detail?: string })?.detail ?? "Couldn't save the credit limit.");
    }
  };

  return (
    <SettingsCard title="Customer credit" description="Debt a customer can be given on credit in one day.">
      <SettingRow label="Daily credit limit per customer" hint={canEdit ? "Credit sales that would take a customer over this today wait for your approval. Leave empty for no limit; zero requires approval for any credit. Customer-specific limits override this default." : "Set by the General Manager/CEO. Credit sales above it need their approval."}>
        {canEdit ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">{symbol}</span>
            <Input inputMode="decimal" value={value} onChange={(e) => { setValue(e.target.value); setSaved(false); }} placeholder="No limit" className="w-full text-right sm:w-40" aria-label="Daily credit limit per customer" aria-invalid={invalid} />
          </div>
        ) : <span className="text-sm font-semibold text-foreground">{current === "" ? "No limit" : fmtMoney(Number(current), symbol)}</span>}
      </SettingRow>
      {canEdit && <div className="-mx-4 sm:-mx-5"><SaveBar dirty={dirty} invalid={invalid} saving={updateTenant.isPending} saved={saved} error={error} onSave={() => void save()} onReset={() => { setValue(current); setError(null); }} /></div>}
    </SettingsCard>
  );
}

const APPROVAL_KINDS: { key: string; label: string }[] = [
  { key: "debt_over_limit", label: "A client's total debt would go over the limit" },
  { key: "price_change", label: "A selling price is changed" },
  { key: "stock_adjustment", label: "A stock count is corrected" },
  { key: "stock_transfer", label: "Stock is sent to another branch" },
];

/** What needs an owner's approval, and the debt limit per client. Only someone who can approve may change it. */
function ApprovalRulesCard({ tenant, canEdit, symbol }: { tenant: Tenant; canEdit: boolean; symbol: string }) {
  const updateTenant = useUpdateMyTenant();
  const startLimit = tenant.debt_limit_per_client == null ? "" : String(Number(tenant.debt_limit_per_client));
  const [limit, setLimit] = useState(startLimit);
  const [rules, setRules] = useState<Record<string, boolean>>(tenant.approval_rules ?? {});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const on = (k: string) => rules[k] !== false;
  const dirty = limit.trim() !== startLimit || APPROVAL_KINDS.some((k) => on(k.key) !== ((tenant.approval_rules ?? {})[k.key] !== false));
  const invalid = limit.trim() !== "" && !/^\d+(\.\d{1,2})?$/.test(limit.trim());
  const save = async () => {
    setError(null);
    try {
      await updateTenant.mutateAsync({ id: tenant.id, data: { debt_limit_per_client: limit.trim() === "" ? null : Number(limit), approval_rules: { ...(tenant.approval_rules ?? {}), ...Object.fromEntries(APPROVAL_KINDS.map((k) => [k.key, on(k.key)])) } } });
      setSaved(true);
    } catch (err) { setError((err as { detail?: string })?.detail ?? "Couldn't save the approval rules."); }
  };
  return (
    <SettingsCard title="Approval rules" description="What your team must ask an owner about first. Owners and approvers are never held up by these.">
      <SettingRow label="Debt limit per client" hint="When a client's total debt would pass this, the new debt waits for approval and is not counted until approved. Leave empty for no limit.">
        {canEdit ? (
          <div className="flex items-center gap-2"><span className="text-sm text-muted">{symbol}</span><Input inputMode="decimal" value={limit} onChange={(e) => { setLimit(e.target.value); setSaved(false); }} placeholder="No limit" className="w-full text-right sm:w-40" aria-label="Debt limit per client" /></div>
        ) : <span className="text-sm font-semibold text-foreground">{startLimit === "" ? "No limit" : fmtMoney(Number(startLimit), symbol)}</span>}
      </SettingRow>
      <p className="pt-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Ask for approval when</p>
      {APPROVAL_KINDS.map((k) => (
        <SettingRow key={k.key} label={k.label}>
          <Toggle checked={on(k.key)} label={k.label} disabled={!canEdit} onChange={(v) => { setRules({ ...rules, [k.key]: v }); setSaved(false); }} />
        </SettingRow>
      ))}
      {canEdit && <div className="-mx-4 sm:-mx-5"><SaveBar dirty={dirty} invalid={invalid} saving={updateTenant.isPending} saved={saved} error={error} onSave={() => void save()} onReset={() => { setLimit(startLimit); setRules(tenant.approval_rules ?? {}); setSaved(false); }} /></div>}
    </SettingsCard>
  );
}

const SALES_POLICIES = [
  { key: "sale_approval", label: "Approve every sale before it is paid", hint: "A sale made by someone without sale approval rights waits in Sales History as \"Awaiting Approval\". Nothing is paid, taken from stock or booked until an approver approves it. Off: sales complete at once, as now." },
  { key: "sale_no_self_approval", label: "Approvers cannot approve their own sales", hint: "With the rule above on, even an approver's own sale waits for a different approver." },
  { key: "own_sales_only", label: "Salespeople see only their own sales", hint: "People without sale approval rights see only the sales and quotations they are the salesperson on. Owners and approvers still see everything." },
] as const;

function SalesPoliciesCard({ tenant, canEdit }: { tenant: Tenant; canEdit: boolean }) {
  const update = useUpdateMyTenant();
  const saved = tenant.approval_rules ?? {};
  const [rules, setRules] = useState<Record<string, boolean>>(saved);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = SALES_POLICIES.some((p) => (rules[p.key] === true) !== (saved[p.key] === true));
  const save = async () => {
    setError(null);
    try { await update.mutateAsync({ id: tenant.id, data: { approval_rules: { ...saved, ...Object.fromEntries(SALES_POLICIES.map((p) => [p.key, rules[p.key] === true])) } } }); setDone(true); }
    catch (err) { setError((err as { detail?: string })?.detail ?? "Couldn't save the sales policies."); }
  };
  return (
    <SettingsCard title="Sales policies" description="How your sales team works. All are off until you switch them on, and other businesses are not affected.">
      {SALES_POLICIES.map((p) => (
        <SettingRow key={p.key} label={p.label} hint={p.hint}>
          <Toggle checked={rules[p.key] === true} label={p.label} disabled={!canEdit} onChange={(v) => { setRules({ ...rules, [p.key]: v }); setDone(false); }} />
        </SettingRow>
      ))}
      {canEdit && <div className="-mx-4 sm:-mx-5"><SaveBar dirty={dirty} invalid={false} saving={update.isPending} saved={done} error={error} onSave={() => void save()} onReset={() => { setRules(saved); setDone(false); }} /></div>}
    </SettingsCard>
  );
}

function QuotationTermsCard({ tenant, canEdit }: { tenant: Tenant; canEdit: boolean }) {
  const update = useUpdateMyTenant();
  const start = tenant.quotation_terms ?? "";
  const [value, setValue] = useState(start);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    try { await update.mutateAsync({ id: tenant.id, data: { quotation_terms: value.trim() || null } }); setDone(true); }
    catch (err) { setError((err as { detail?: string })?.detail ?? "Couldn't save the quotation terms."); }
  };
  return (
    <SettingsCard title="Quotation terms" description="Printed at the foot of every quotation, for example your bank details and how long an offer is valid. Each new quotation starts from this text.">
      <SettingRow label="Bank details and notes" hint="One line per bank account or note. Staff can still edit the text on an individual quotation.">
        <textarea aria-label="Quotation terms" rows={6} maxLength={3000} disabled={!canEdit} value={value} onChange={(e) => { setValue(e.target.value); setDone(false); }}
          className="w-full min-w-0 rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent sm:w-96" placeholder={"Bank: CRDB, Account name: ..., Account no: ...\nQuotation is valid for 7 days only if stock is available."} />
      </SettingRow>
      {canEdit && <div className="-mx-4 sm:-mx-5"><SaveBar dirty={value !== start} invalid={false} saving={update.isPending} saved={done} error={error} onSave={() => void save()} onReset={() => { setValue(start); setDone(false); }} /></div>}
    </SettingsCard>
  );
}

function TimezoneCard({ tenant, canEdit }: { tenant: Tenant; canEdit: boolean }) {
  const update = useUpdateMyTenant();
  const [value, setValue] = useState(tenant.timezone ?? "UTC");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  async function save() {
    setError(null);
    try { await update.mutateAsync({ id: tenant.id, data: { timezone: value.trim() } }); setSaved(true); }
    catch { setError("Choose a valid IANA timezone, for example Africa/Kigali."); }
  }
  return <SettingsCard title="Business timezone" description="Sets daily credit boundaries and daily branch reporting dates.">
    <SettingRow label="Timezone" hint="An IANA timezone, for example Africa/Kigali. Existing businesses keep UTC until it is set."><Input aria-label="Business timezone" value={value} disabled={!canEdit} onChange={(e) => { setValue(e.target.value); setSaved(false); }} className="w-full sm:w-56" /></SettingRow>
    {canEdit && <div className="-mx-4 sm:-mx-5"><SaveBar dirty={value !== (tenant.timezone ?? "UTC")} invalid={!value.trim()} saving={update.isPending} saved={saved} error={error} onSave={() => void save()} onReset={() => setValue(tenant.timezone ?? "UTC")} /></div>}
  </SettingsCard>;
}

/** VAT registration details and pricing policy. Changes apply to documents priced from now on; recorded sales,
 *  invoices and journals keep the VAT they were recorded with. Owners, administrators or tax:update may edit. */
function VatDetails({ tenant, canEdit }: { tenant: Tenant; canEdit: boolean }) {
  const update = useUpdateMyTenant();
  const qc = useQueryClient();
  const initial = { vat_number: tenant.vat_number ?? "", vat_registered_from: tenant.vat_registered_from ?? "", vat_pricing_mode: tenant.vat_pricing_mode ?? "inclusive" };
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const set = (key: keyof typeof form, value: string) => { setForm((f) => ({ ...f, [key]: value })); setSaved(false); };
  const save = async () => {
    setError(null);
    try {
      await update.mutateAsync({ id: tenant.id, data: { vat_number: form.vat_number.trim() || null, vat_registered_from: form.vat_registered_from || null, vat_pricing_mode: form.vat_pricing_mode as "inclusive" | "exclusive" } });
      await qc.invalidateQueries({ queryKey: ["sales", "vat-rate"] });
      setSaved(true);
    } catch (err) {
      setError((err as { detail?: string })?.detail ?? "Couldn't save the VAT settings.");
    }
  };
  return <>
    <SettingRow label="VAT registration number" hint="Printed on receipts and invoices.">
      <Input aria-label="VAT registration number" value={form.vat_number} maxLength={50} disabled={!canEdit} onChange={(e) => set("vat_number", e.target.value)} className="w-full sm:w-56" />
    </SettingRow>
    <SettingRow label="Registered from" hint="Sales dated before this day are recorded without VAT. Leave empty if always registered.">
      <Input type="date" aria-label="VAT registered from" value={form.vat_registered_from} disabled={!canEdit} onChange={(e) => set("vat_registered_from", e.target.value)} className="w-full sm:w-56" />
    </SettingRow>
    <SettingRow label="Selling prices" hint={form.vat_pricing_mode === "exclusive" ? "VAT is added on top of each selling price at checkout." : "Selling prices already include VAT (the default). Totals do not change; VAT is the part of the price owed to the tax authority."}>
      <Select aria-label="How selling prices treat VAT" value={form.vat_pricing_mode} disabled={!canEdit} onChange={(e) => set("vat_pricing_mode", e.target.value)} className="w-full sm:w-56">
        <option value="inclusive">Prices include VAT</option>
        <option value="exclusive">VAT added to prices</option>
      </Select>
    </SettingRow>
    {canEdit && <div className="-mx-4 sm:-mx-5"><SaveBar dirty={dirty} invalid={false} saving={update.isPending} saved={saved} error={error} onSave={() => void save()} onReset={() => { setForm(initial); setError(null); }} /></div>}
  </>;
}

export default function FinancialSettingsPage() {
  const { brandColor, vatEnabled, setVatEnabled, currencySymbol } = useAppConfig();
  const { hasPermission, isAdmin } = useAuth();
  const { data: tenant } = useCurrentTenant();
  const vatRate = useVatRate();
  const canEditVat = isAdmin() || hasPermission("tax:update");
  const updateTenant = useUpdateMyTenant();
  const [vatError, setVatError] = useState<string | null>(null);
  const qc = useQueryClient();

  // VAT saves the moment it is toggled (the existing behaviour), and rolls back if the server refuses.
  const toggleVat = async () => {
    if (!tenant) return;
    const next = !vatEnabled;
    setVatError(null);
    setVatEnabled(next);
    try { await updateTenant.mutateAsync({ id: tenant.id, data: { vat_enabled: next } }); await qc.invalidateQueries({ queryKey: ["sales", "vat-rate"] }); }
    catch { setVatEnabled(!next); setVatError("Couldn't update VAT. Try again."); }
  };

  const group = (title: string, children: ReactNode) => <section className="space-y-3"><h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h2>{children}</section>;
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {group("Currency, tax and time", <>
        <FinancialSettings color={brandColor} />
      <SettingsCard title="VAT" description="Registration, pricing and how VAT is charged on sales." icon={ReceiptText}>
        <SettingRow label={vatEnabled ? "VAT enabled" : "VAT disabled"} hint={vatEnabled ? `Standard rate ${vatRate.data?.rate ?? 18}%. Each product's own treatment (standard, zero-rated, exempt or out of scope) is set in Inventory → Products.` : "No VAT is charged or shown on receipts. Sales already recorded keep their VAT."}>
          <Toggle checked={vatEnabled} onChange={toggleVat} loading={updateTenant.isPending} disabled={!tenant || !canEditVat} label={vatEnabled ? "Disable VAT" : "Enable VAT"} />
        </SettingRow>
        {vatError && <p role="alert" className="pb-3 text-xs text-red-600 dark:text-red-400">{vatError}</p>}
        {tenant && vatEnabled && <VatDetails key={`${tenant.vat_number ?? ""}${tenant.vat_registered_from ?? ""}${tenant.vat_pricing_mode ?? ""}`} tenant={tenant} canEdit={canEditVat} />}
        <div className="my-4 flex items-start gap-3 rounded-xl bg-accent/5 p-4 text-xs leading-relaxed text-muted"><Info size={18} className="shrink-0 text-accent" />Enable VAT if your business is registered for Value Added Tax. Changes apply to new sales only; recorded sales, invoices and journal entries keep the VAT they were recorded with.</div>
      </SettingsCard>
        {tenant && <TimezoneCard key={tenant.timezone} tenant={tenant} canEdit={hasPermission("tenants:update")} />}
      </>)}
      {group("Credit and approvals", <>
        {tenant && <CreditLimitCard key={String(tenant.credit_daily_limit ?? "")} tenant={tenant} canEdit={hasPermission("credit:approve")} symbol={currencySymbol} />}
        {tenant && <ApprovalRulesCard key={`${tenant.debt_limit_per_client ?? ""}${JSON.stringify(tenant.approval_rules ?? {})}`} tenant={tenant} canEdit={hasPermission("approvals:approve")} symbol={currencySymbol} />}
        {tenant && <SalesPoliciesCard key={JSON.stringify(tenant.approval_rules ?? {})} tenant={tenant} canEdit={hasPermission("approvals:approve")} />}
      </>)}
      {group("Documents", <>
        {tenant && <QuotationTermsCard key={tenant.quotation_terms ?? ""} tenant={tenant} canEdit={hasPermission("tenants:update")} />}
      </>)}
    </div>
  );
}
