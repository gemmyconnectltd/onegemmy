"use client";

import { ReceiptText, Info } from "lucide-react";
import { useState } from "react";
import { useAppConfig } from "@/lib/appConfig";
import { useCurrentTenant, useUpdateMyTenant } from "@/lib/api/hooks";
import { Toggle } from "@/components/ui/Toggle";
import { FinancialSettings } from "@/components/settings/FinancialSettings";
import { SaveBar, SettingRow, SettingsCard } from "@/components/settings/parts";
import { Input } from "@/components/ui/Form";
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
            <Input inputMode="decimal" value={value} onChange={(e) => { setValue(e.target.value); setSaved(false); }} placeholder="No limit" className="w-40 text-right" aria-label="Daily credit limit per customer" aria-invalid={invalid} />
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
      await updateTenant.mutateAsync({ id: tenant.id, data: { debt_limit_per_client: limit.trim() === "" ? null : Number(limit), approval_rules: Object.fromEntries(APPROVAL_KINDS.map((k) => [k.key, on(k.key)])) } });
      setSaved(true);
    } catch (err) { setError((err as { detail?: string })?.detail ?? "Couldn't save the approval rules."); }
  };
  return (
    <SettingsCard title="Approval rules" description="What your team must ask an owner about first. Owners and approvers are never held up by these.">
      <SettingRow label="Debt limit per client" hint="When a client's total debt would pass this, the new debt waits for approval and is not counted until approved. Leave empty for no limit.">
        {canEdit ? (
          <div className="flex items-center gap-2"><span className="text-sm text-muted">{symbol}</span><Input inputMode="decimal" value={limit} onChange={(e) => { setLimit(e.target.value); setSaved(false); }} placeholder="No limit" className="w-40 text-right" aria-label="Debt limit per client" /></div>
        ) : <span className="text-sm font-semibold text-foreground">{startLimit === "" ? "No limit" : fmtMoney(Number(startLimit), symbol)}</span>}
      </SettingRow>
      {APPROVAL_KINDS.map((k) => (
        <SettingRow key={k.key} label={`Ask for approval when: ${k.label.charAt(0).toLowerCase()}${k.label.slice(1)}`} hint="">
          <Toggle checked={on(k.key)} label={k.label} disabled={!canEdit} onChange={(v) => { setRules({ ...rules, [k.key]: v }); setSaved(false); }} />
        </SettingRow>
      ))}
      {canEdit && <div className="-mx-4 sm:-mx-5"><SaveBar dirty={dirty} invalid={invalid} saving={updateTenant.isPending} saved={saved} error={error} onSave={() => void save()} onReset={() => { setLimit(startLimit); setRules(tenant.approval_rules ?? {}); setSaved(false); }} /></div>}
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
    <SettingRow label="Timezone" hint="Use an IANA timezone. Existing businesses retain UTC until configured."><Input aria-label="Business timezone" value={value} disabled={!canEdit} onChange={(e) => { setValue(e.target.value); setSaved(false); }} /></SettingRow>
    {canEdit && <SaveBar dirty={value !== (tenant.timezone ?? "UTC")} invalid={!value.trim()} saving={update.isPending} saved={saved} error={error} onSave={() => void save()} onReset={() => setValue(tenant.timezone ?? "UTC")} />}
  </SettingsCard>;
}

export default function FinancialSettingsPage() {
  const { brandColor, vatEnabled, setVatEnabled, currencySymbol } = useAppConfig();
  const { hasPermission } = useAuth();
  const { data: tenant } = useCurrentTenant();
  const updateTenant = useUpdateMyTenant();
  const [vatError, setVatError] = useState<string | null>(null);

  // VAT saves the moment it is toggled (the existing behaviour), and rolls back if the server refuses.
  const toggleVat = async () => {
    if (!tenant) return;
    const next = !vatEnabled;
    setVatError(null);
    setVatEnabled(next);
    try { await updateTenant.mutateAsync({ id: tenant.id, data: { vat_enabled: next } }); }
    catch { setVatEnabled(!next); setVatError("Couldn't update VAT. Try again."); }
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <FinancialSettings color={brandColor} />
      {tenant && <TimezoneCard key={tenant.timezone} tenant={tenant} canEdit={hasPermission("tenants:update")} />}
      {tenant && <CreditLimitCard key={String(tenant.credit_daily_limit ?? "")} tenant={tenant} canEdit={hasPermission("credit:approve")} symbol={currencySymbol} />}
      {tenant && <ApprovalRulesCard key={`${tenant.debt_limit_per_client ?? ""}${JSON.stringify(tenant.approval_rules ?? {})}`} tenant={tenant} canEdit={hasPermission("approvals:approve")} symbol={currencySymbol} />}
      <SettingsCard title="VAT Settings" description="Configure Value Added Tax settings." icon={ReceiptText}>
        <SettingRow label={vatEnabled ? "VAT enabled" : "VAT disabled"} hint={vatEnabled ? "18% tax is applied to sales and shown on receipts." : "No tax is applied to sales or shown on receipts."}>
          <Toggle checked={vatEnabled} onChange={toggleVat} loading={updateTenant.isPending} disabled={!tenant} label={vatEnabled ? "Disable VAT" : "Enable VAT"} />
        </SettingRow>
        {vatError && <p role="alert" className="pb-3 text-xs text-red-600 dark:text-red-400">{vatError}</p>}
        <div className="my-4 flex items-start gap-3 rounded-xl bg-accent/5 p-4 text-xs leading-relaxed text-muted"><Info size={18} className="shrink-0 text-accent" />Enable VAT if your business is registered for Value Added Tax.</div>
      </SettingsCard>
    </div>
  );
}
