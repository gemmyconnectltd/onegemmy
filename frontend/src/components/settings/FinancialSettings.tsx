"use client";

import { useState } from "react";
import { Banknote, Lock } from "lucide-react";
import {
  useCurrencySettings, useCurrentTenant, useUpdateMyTenant,
} from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { useAppConfig } from "@/lib/appConfig";
import { currencySymbolFor } from "@/lib/money";
import { SettingRow, SettingsCard } from "@/components/settings/parts";

/**
 * Financial settings: the business's base (accounting) currency. (Exchange rates are deliberately not
 * part of business settings.) The base currency is accounting configuration — it can only be changed
 * while the business has recorded nothing; after that it is locked, because switching RWF → USD would
 * re-read every historical amount in a different currency.
 */
export function FinancialSettings({ color }: { color: string }) {
  const { currencies, setCurrency } = useAppConfig();
  const settingsQ = useCurrencySettings();
  const { data: tenant } = useCurrentTenant();
  const updateTenant = useUpdateMyTenant();

  const [selected, setSelected] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (settingsQ.isLoading || !settingsQ.data) return <PageLoader variant="compact" />;
  const { base_currency: base, can_change: canChange, locked_reason: lockedReason } = settingsQ.data;
  const current = currencies.find((c) => c.code === base);
  const pick = selected ?? base;
  const dirty = pick !== base;

  const save = async () => {
    if (!tenant || !dirty) return;
    setSaveError(null);
    try {
      await updateTenant.mutateAsync({ id: tenant.id, data: { currency: pick } });
      setCurrency(pick);
      setSelected(null);
      await settingsQ.refetch();
    } catch (err) {
      setSaveError((err as { detail?: string })?.detail ?? "Couldn't change the base currency.");
    }
  };

  return (
    <SettingsCard title="Base currency" icon={Banknote} description={`${current?.name ?? base} (${base}, symbol ${currencySymbolFor(base)}). Reports, the ledger and VAT are kept in this currency.`}>
      <SettingRow label="Accounting currency" hint={canChange ? "Can be changed only until the business records its first transaction." : lockedReason ?? "Locked once transactions exist, so historical amounts keep their meaning."}>
        <div className="flex flex-wrap items-center gap-2">
          <Select id="base-currency" aria-label="Base currency" value={pick} disabled={!canChange || updateTenant.isPending}
            onChange={(e) => setSelected(e.target.value)} className="w-full sm:w-64">
            {currencies.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
          </Select>
          {canChange && dirty && (
            <Button type="button" variant="primary" color={color} onClick={save} disabled={updateTenant.isPending}>
              {updateTenant.isPending ? "Saving…" : "Save"}
            </Button>
          )}
          {!canChange && <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-muted"><Lock size={11} /> Locked</span>}
        </div>
        {saveError && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400" role="alert">{saveError}</p>}
      </SettingRow>
    </SettingsCard>
  );
}
