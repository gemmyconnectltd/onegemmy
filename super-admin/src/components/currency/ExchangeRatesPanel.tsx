"use client";
import { TableScroll } from "@/components/ui/TableScroll";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { ExchangeRate, ExchangeRateInput } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { fmtDateTime } from "@/lib/date";

interface CurrencyOption {
  code: string;
  name: string;
}

/** "1,450" — rates keep their significant decimals (0.0006896552) instead of being rounded like money. */
export function formatRate(rate: number): string {
  return Number(rate).toLocaleString("en-US", { maximumFractionDigits: 10 });
}

/**
 * Manually managed exchange rates into one fixed currency. Each rate reads "1 USD = 1,450 RWF" and is
 * append-only: adding a new one never edits an old one, so documents already posted keep the rate they
 * were posted with. Used for a business (target = its base currency) and for the platform (target = the
 * reporting currency).
 */
export function ExchangeRatesPanel({
  targetCurrency, rates, loading, currencies, onCreate, creating,
}: {
  targetCurrency: string;
  rates: ExchangeRate[] | undefined;
  loading: boolean;
  currencies: CurrencyOption[];
  onCreate: (input: ExchangeRateInput) => Promise<unknown>;
  creating: boolean;
}) {
  const [from, setFrom] = useState("");
  const [rate, setRate] = useState("");
  const [effective, setEffective] = useState("");
  const [error, setError] = useState<string | null>(null);

  const options = currencies.filter((c) => c.code !== targetCurrency);
  const rateNum = Number(rate);
  const valid = !!from && Number.isFinite(rateNum) && rateNum > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || creating) return;
    setError(null);
    try {
      await onCreate({
        base_currency: from,
        quote_currency: targetCurrency,
        rate: rateNum,
        effective_at: effective ? new Date(effective).toISOString() : undefined,
      });
      setRate("");
      setEffective("");
    } catch (err) {
      setError((err as { detail?: string })?.detail ?? "Couldn't save the rate. Try again.");
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <Field label="Currency">
          <Select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Currency to price">
            <option value="">Select…</option>
            {options.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
          </Select>
        </Field>
        <Field label={from ? `1 ${from} =` : "1 unit ="} className="sm:min-w-[11rem]">
          <div className="flex items-center gap-2">
            <Input type="number" inputMode="decimal" min="0" step="any" value={rate} onChange={(e) => setRate(e.target.value)}
              placeholder="e.g. 1450" aria-label="Rate" />
            <span className="text-[13px] font-semibold text-muted">{targetCurrency}</span>
          </div>
        </Field>
        <Field label="Effective from (optional)">
          <Input type="datetime-local" value={effective} onChange={(e) => setEffective(e.target.value)} />
        </Field>
        <div className="sm:col-span-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted">
            New rates apply from their effective time. Documents already posted keep the rate they were posted with.
          </p>
          <Button type="submit" variant="primary" disabled={!valid || creating} className="rounded-lg text-[13px]">
            <Plus size={14} /> {creating ? "Saving…" : "Add rate"}
          </Button>
        </div>
        {error && <p className="sm:col-span-3 text-[12px] font-medium text-red-600 dark:text-red-400" role="alert">{error}</p>}
      </form>

      {loading ? (
        <PageLoader variant="compact" />
      ) : (rates?.length ?? 0) === 0 ? (
        <p className="rounded-lg bg-surface px-4 py-6 text-center text-[13px] text-muted">
          No exchange rates yet. Add one to start using a foreign currency.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <TableScroll><table className="w-full min-w-[420px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface text-[11px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-semibold">Rate</th>
                <th className="px-3 py-2 font-semibold">Effective from</th>
                <th className="px-3 py-2 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rates!.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-semibold text-foreground tabular-nums">
                    1 {r.base_currency} = {formatRate(r.rate)} {r.quote_currency}
                  </td>
                  <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtDateTime(r.effective_at)}</td>
                  <td className="px-3 py-2 text-muted capitalize">{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table></TableScroll>
        </div>
      )}
    </div>
  );
}
