"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PERIOD_CODES, PERIOD_PRESETS, presetFromCode, presetRange, toISODate, type DateRange, type PeriodPreset } from "@/lib/adminAnalytics";
import { Input, Select } from "@/components/ui/Form";

/** Date range kept in the URL (`?period=30d`, or `?period=custom&from=…&to=…`) so detail pages open on the same range. */
export function usePeriod() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const preset = presetFromCode(params.get("period"));
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const today = toISODate(new Date());

  const range: DateRange = useMemo(() => {
    if (preset !== "custom") return presetRange(preset);
    const fallback = presetRange("last_30_days");
    return { from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : fallback.from, to: /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : fallback.to };
  }, [preset, from, to]);
  const valid = range.from <= range.to && range.to <= today;

  const replace = useCallback((next: { preset: PeriodPreset; from?: string; to?: string }) => {
    const q = new URLSearchParams({ period: PERIOD_CODES[next.preset] });
    if (next.preset === "custom") { q.set("from", next.from ?? range.from); q.set("to", next.to ?? range.to); }
    router.replace(`${pathname}?${q}`, { scroll: false });
  }, [router, pathname, range]);

  /** Query string that carries the current range to another traffic page. */
  const query = preset === "custom" ? `period=custom&from=${range.from}&to=${range.to}` : `period=${PERIOD_CODES[preset]}`;
  return { preset, range, valid, today, query, replace };
}

export function PeriodSelect({ period }: { period: ReturnType<typeof usePeriod> }) {
  const { preset, range, today, replace } = period;
  return (
    <>
      <Select aria-label="Date range" className="w-auto!" value={preset} onChange={(e) => replace({ preset: e.target.value as PeriodPreset })}>
        {PERIOD_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </Select>
      {preset === "custom" && (
        <>
          <Input aria-label="From date" type="date" className="w-auto!" max={range.to} value={range.from} onChange={(e) => replace({ preset: "custom", from: e.target.value })} />
          <Input aria-label="To date" type="date" className="w-auto!" min={range.from} max={today} value={range.to} onChange={(e) => replace({ preset: "custom", to: e.target.value })} />
        </>
      )}
    </>
  );
}
