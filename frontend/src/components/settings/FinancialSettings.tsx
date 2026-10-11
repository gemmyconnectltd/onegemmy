"use client";

import { useState } from "react";
import { Banknote, Lock } from "lucide-react";
import {
  useCreateExchangeRate, useCurrencySettings, useCurrentTenant, useExchangeRates, useUpdateMyTenant,
} from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { ExchangeRatesPanel } from "@/components/currency/ExchangeRatesPanel";
import { useAppConfig } from "@/lib/appConfig";
import { currencySymbolFor } from "@/lib/money";

/**
 * Financial settings: the business's base (accounting) currency, and the exchange rates used to book
 * foreign-currency documents. The base currency is accounting configuration — it can only be changed
 * while the business has recorded nothing; after that it is locked, because switching RWF → USD would
 * re-read every historical amount in a different currency.
 */
export function FinancialSettings({ color }: { color: string }) {
  const { currencies, setCurrency } = useAppConfig();
  const settingsQ = useCurrencySettings();
  const { data: tenant } = useCurrentTenant();
  const updateTenant = useUpdateMyTenant();
  const ratesQ = useExchangeRates(1, 20);
  const createRate = useCreateExchangeRate();

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
    <>
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ backgroundColor: `${color}15` }}>
            <Banknote size={15} style={{ color }} />
          </div>
          <h2 className="text-sm font-bold text-foreground">Financial Settings</h2>
        </div>

        <div>
          <label className="block text-[12px] font-semibold text-muted mb-1.5" htmlFor="base-currency">Base currency</label>
          <div className="flex flex-wrap items-center gap-2">
            <Select id="base-currency" value={pick} disabled={!canChange || updateTenant.isPending}
              onChange={(e) => setSelected(e.target.value)} className="max-w-sm">
              {currencies.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
            </Select>
            {canChange && dirty && (
              <Button type="button" variant="primary" color={color} onClick={save} disabled={updateTenant.isPending} className="rounded-lg text-[13px]">
                {updateTenant.isPending ? "Saving…" : "Save"}
              </Button>
            )}
            {!canChange && (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-muted">
                <Lock size={11} /> Locked
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">
            {current?.name ?? base} · {base} · symbol {currencySymbolFor(base)}. All reports, the ledger and VAT are kept in this currency.
          </p>
          {!canChange && lockedReason && <p className="mt-1 text-xs text-muted">{lockedReason}</p>}
          {saveError && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400" role="alert">{saveError}</p>}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
        <div>
          <h2 className="text-sm font-bold text-foreground">Exchange rates</h2>
          <p className="text-xs text-muted mt-0.5">
            Only needed if you invoice, buy or spend in a currency other than {base}. Enter how many {base} one unit of the foreign currency is worth.
          </p>
        </div>
        <ExchangeRatesPanel
          targetCurrency={base}
          rates={ratesQ.data?.items}
          loading={ratesQ.isLoading}
          currencies={currencies}
          onCreate={(input) => createRate.mutateAsync(input)}
          creating={createRate.isPending}
        />
      </div>
    </>
  );
}
