// The ONE place money is formatted on the client. Never build "RWF " + amount by hand.
//
//   formatMoney(1500000, "RWF")  → "RWF 1,500,000"   (RWF has no minor unit)
//   formatMoney(1500, "USD")     → "$1,500.00"
//   formatMoney(25000, "KES")    → "KSh 25,000.00"
//   formatMoney(1500, "EUR")     → "€1,500.00"
//
// Decimal places come from the ISO 4217 minor unit of the currency (via Intl), so a zero-decimal
// currency is never shown with fractions and a three-decimal one (KWD) never loses its third. The
// currency is always an ISO code; the symbol is a display hint only.

import { CURRENCY, CURRENCY_SYMBOL, currencies } from "@/lib/config";

const SYMBOL = new Map<string, string>(currencies.map((c) => [c.code, c.symbol]));

// A symbol shared by several currencies ("$", "£", "kr", "Sh") would be ambiguous next to other
// currencies, so those are written with their code instead. These very common ones keep their symbol.
const SYMBOL_COUNT = new Map<string, number>();
for (const c of currencies) SYMBOL_COUNT.set(c.symbol, (SYMBOL_COUNT.get(c.symbol) ?? 0) + 1);
const ALWAYS_SYMBOL = new Set(["USD", "EUR", "GBP", "JPY"]);

const decimalsCache = new Map<string, number>();

/** ISO minor-unit digits for a currency: RWF/UGX/JPY → 0, USD/KES → 2, KWD/BHD → 3. */
export function currencyDecimals(code: string): number {
  const hit = decimalsCache.get(code);
  if (hit !== undefined) return hit;
  let places = 2;
  try {
    places = new Intl.NumberFormat("en-US", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    /* unknown code → default */
  }
  decimalsCache.set(code, places);
  return places;
}

/** Display symbol for a code, falling back to the code itself. */
export function currencySymbolFor(code: string): string {
  return SYMBOL.get(code) ?? code;
}

/** What goes in front of the number: the symbol when it is unambiguous, otherwise the code. */
function prefixFor(code: string): { text: string; spaced: boolean } {
  const sym = SYMBOL.get(code);
  const unique = sym !== undefined && (SYMBOL_COUNT.get(sym) ?? 0) === 1;
  const text = sym !== undefined && (unique || ALWAYS_SYMBOL.has(code)) ? sym : code;
  // "$1,500" but "KSh 25,000" / "RWF 1,500,000": letters need a space, a pure symbol does not.
  return { text, spaced: /[A-Za-z]$/.test(text) };
}

export interface FormatMoneyOptions {
  /** 12.5K / 1.2M style for dense UI; full precision when the amount is small or this is false. */
  compact?: boolean;
  /** Force "USD 1,500.00" instead of "$1,500.00". */
  showCode?: boolean;
}

const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function formatMoney(
  amount: number | string | null | undefined,
  currencyCode: string,
  opts: FormatMoneyOptions = {},
): string {
  const code = (currencyCode || CURRENCY).toUpperCase();
  const value = Number(amount ?? 0);
  const v = Number.isFinite(value) ? value : 0;
  const places = currencyDecimals(code);
  const prefix = opts.showCode ? { text: code, spaced: true } : prefixFor(code);
  const abs = Math.abs(v);
  const body =
    opts.compact && abs >= 10_000
      ? COMPACT.format(abs)
      : abs.toLocaleString("en-US", { minimumFractionDigits: places, maximumFractionDigits: places });
  // A value that rounds to zero must not read as "-0".
  const negative = v < 0 && Number(abs.toFixed(places)) !== 0;
  return prefix.spaced ? `${prefix.text} ${negative ? "-" : ""}${body}` : `${negative ? "-" : ""}${prefix.text}${body}`;
}

/** The tenant's own base currency amount, using the active currency set by AppConfigProvider. */
export function formatBase(amount: number | string | null | undefined, opts?: FormatMoneyOptions): string {
  return formatMoney(amount, CURRENCY, opts);
}

/** The active (base) currency code and symbol — module state, set once after the tenant loads. */
export function activeCurrency(): { code: string; symbol: string } {
  return { code: CURRENCY, symbol: CURRENCY_SYMBOL };
}
