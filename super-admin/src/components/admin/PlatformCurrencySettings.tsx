"use client";

import { useEffect, useState } from "react";
import {
  useAdminCreateExchangeRate, useAdminExchangeRates, usePlatformCurrencySettings, useSetReportingCurrency,
} from "@/lib/api/hooks";
import { Select } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { ExchangeRatesPanel } from "@/components/currency/ExchangeRatesPanel";
import { useAppConfig } from "@/lib/appConfig";
import { SaveBar, SettingRow } from "./settingsParts";

/**
 * PESAA's own reporting currency and platform-wide exchange rates. These only decide how cross-tenant
 * totals are *presented*; they never change any tenant's base currency or its books.
 */
export function PlatformCurrencySettings({ onDirtyChange }: { onDirtyChange: (d: boolean) => void }) {
  const { currencies } = useAppConfig();
  const settingsQ = usePlatformCurrencySettings();
  const setReporting = useSetReportingCurrency();
  const ratesQ = useAdminExchangeRates(1, 20);
  const createRate = useAdminCreateExchangeRate();
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const current = settingsQ.data?.reporting_currency;
  const pick = selected ?? current ?? "";
  const dirty = !!current && pick !== current;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);

  if (settingsQ.isError) return <p role="alert" className="text-sm text-red-600 dark:text-red-400">Couldn&apos;t load currency settings. <button onClick={() => void settingsQ.refetch()} className="font-semibold underline">Retry</button></p>;
  if (!settingsQ.data || !current) return <PageLoader variant="compact" />;

  const save = async () => {
    setError(null); setSaved(false);
    try { await setReporting.mutateAsync(pick); setSelected(null); setSaved(true); }
    catch (err) { setError((err as { detail?: string })?.detail ?? "Couldn't update the reporting currency."); }
  };

  return (
    <>
      <SettingRow label="Platform reporting currency" hint="Used by Overview and Usage totals. Does not change any tenant's base currency.">
        <Select value={pick} onChange={(e) => { setSelected(e.target.value); setSaved(false); }} disabled={setReporting.isPending} aria-label="Platform reporting currency" className="w-full sm:w-72">
          {currencies.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
        </Select>
      </SettingRow>
      <SaveBar dirty={dirty} saving={setReporting.isPending} saved={saved} error={error} onSave={save} />

      <div className="mt-6 space-y-3 border-t border-border pt-5">
        <div>
          <h3 className="text-sm font-bold text-foreground">Exchange rates</h3>
          <p className="mt-0.5 text-[12px] text-muted">Rates into {current}. New rates apply from their effective time; earlier rates are kept. A currency without a rate is shown separately, never assumed equal to {current}.</p>
        </div>
        <ExchangeRatesPanel targetCurrency={current} rates={ratesQ.data?.items} loading={ratesQ.isLoading} currencies={currencies} onCreate={(input) => createRate.mutateAsync(input)} creating={createRate.isPending} />
      </div>
    </>
  );
}
