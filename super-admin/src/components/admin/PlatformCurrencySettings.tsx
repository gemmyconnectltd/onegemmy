"use client";

import { useState } from "react";
import { Coins } from "lucide-react";
import {
  useAdminCreateExchangeRate, useAdminExchangeRates, usePlatformCurrencySettings, useSetReportingCurrency,
} from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { ExchangeRatesPanel } from "@/components/currency/ExchangeRatesPanel";
import { useAppConfig } from "@/lib/appConfig";

/**
 * PESAA's own reporting currency and platform-wide exchange rates. These only decide how cross-tenant
 * totals are *presented* (each tenant's sales are converted into the reporting currency, day by day, at
 * the platform rate in force that day). They never change any tenant's base currency or its books.
 */
export function PlatformCurrencySettings() {
  const { currencies } = useAppConfig();
  const settingsQ = usePlatformCurrencySettings();
  const setReporting = useSetReportingCurrency();
  const ratesQ = useAdminExchangeRates(1, 20);
  const createRate = useAdminCreateExchangeRate();
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (settingsQ.isLoading || !settingsQ.data) return <PageLoader variant="compact" />;
  const current = settingsQ.data.reporting_currency;
  const pick = selected ?? current;

  const save = async () => {
    setError(null);
    try {
      await setReporting.mutateAsync(pick);
      setSelected(null);
    } catch (err) {
      setError((err as { detail?: string })?.detail ?? "Couldn't update the reporting currency.");
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#d9770615" }}>
          <Coins size={16} style={{ color: "#d97706" }} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-foreground">Currency</h2>
          <p className="text-[11px] text-muted">How cross-tenant money is compared — separate from each tenant&apos;s own base currency</p>
        </div>
      </div>

      <div>
        <label htmlFor="reporting-currency" className="block text-[12px] font-semibold text-muted mb-1.5">Platform reporting currency</label>
        <div className="flex flex-wrap items-center gap-2">
          <Select id="reporting-currency" value={pick} onChange={(e) => setSelected(e.target.value)} className="max-w-sm"
            disabled={setReporting.isPending}>
            {currencies.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
          </Select>
          {pick !== current && (
            <Button type="button" variant="primary" onClick={save} disabled={setReporting.isPending} className="rounded-lg text-[13px]">
              {setReporting.isPending ? "Saving…" : "Save"}
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted">
          Used by the Overview and usage figures. Changing it does not change any tenant&apos;s base currency.
        </p>
        {error && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400" role="alert">{error}</p>}
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div>
          <h3 className="text-[13px] font-bold text-foreground">Platform exchange rates</h3>
          <p className="text-xs text-muted mt-0.5">
            Rates into {current}, used to convert tenant sales for platform totals. A currency with no rate is shown
            separately and left out of the converted total — it is never assumed to equal {current}.
          </p>
        </div>
        <ExchangeRatesPanel
          targetCurrency={current}
          rates={ratesQ.data?.items}
          loading={ratesQ.isLoading}
          currencies={currencies}
          onCreate={(input) => createRate.mutateAsync(input)}
          creating={createRate.isPending}
        />
      </div>
    </div>
  );
}
