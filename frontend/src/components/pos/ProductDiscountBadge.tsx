import type { CatalogOffer } from "@/lib/api/discounts";

export function ProductDiscountBadge({ offers, currencySymbol, fmt }: { offers: CatalogOffer[]; currencySymbol?: string; fmt?: (value: number) => string }) {
  if (!offers.length) return null;
  const first = offers[0];
  const label = first.label.startsWith("SAVE ") && first.saving && currencySymbol && fmt ? `SAVE ${currencySymbol} ${fmt(Number(first.saving))}` : first.label;
  return <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white" title={`${first.name}${first.description ? ` · ${first.description}` : ""}${first.conditional ? " · Conditions apply; checkout validates eligibility" : ""}${offers.length > 1 ? ` · ${offers.length - 1} more offers` : ""}`}>
    <span className="truncate">{label}</span>{offers.length > 1 && <span>+{offers.length - 1}</span>}
  </span>;
}
