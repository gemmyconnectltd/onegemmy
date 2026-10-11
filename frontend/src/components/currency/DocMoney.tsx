"use client";

import { useAppConfig } from "@/lib/appConfig";
import { fmtMoney } from "@/lib/config";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * An amount in the document's OWN currency, with its base-currency equivalent as quiet secondary text
 * when (and only when) the document is in a foreign currency. For a base-currency document it renders
 * exactly what `fmtMoney` always did, so single-currency businesses see no change.
 */
export function DocMoney({
  amount, currencyCode, baseAmount, className, secondaryClassName,
}: {
  amount: number | null | undefined;
  /** The document's currency; null/undefined = the business's base currency. */
  currencyCode?: string | null;
  /** The same amount in the base currency at the document's frozen rate. */
  baseAmount?: number | null;
  className?: string;
  secondaryClassName?: string;
}) {
  const { currency: base } = useAppConfig();
  const code = currencyCode || base;
  const foreign = code !== base;
  return (
    <span className={className}>
      {foreign ? formatMoney(amount, code) : fmtMoney(amount)}
      {foreign && baseAmount !== null && baseAmount !== undefined && (
        <span className={cn("block text-[10.5px] font-normal text-muted", secondaryClassName)} title={`Value in ${base} at the rate when it was booked`}>
          ≈ {fmtMoney(baseAmount)}
        </span>
      )}
    </span>
  );
}
