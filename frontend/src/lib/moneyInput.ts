// Typing-friendly money input helpers. Amounts stay strings end to end (no floating point); the backend receives exactly what was typed.

/** Keeps digits and one decimal point, and no more fraction digits than the currency has. "12,5" and "12.5" both become "12.5"; "1e3" loses the letter. */
export function sanitizeAmount(raw: string, decimals: number): string {
  // A comma is a thousands separator ("1,250.50", "1,250,000") unless it is the only separator and what follows fits the decimals ("12,5").
  const commas = (raw.match(/,/g) ?? []).length;
  const decimalComma = decimals > 0 && !raw.includes(".") && commas === 1 && raw.length - raw.indexOf(",") - 1 <= decimals;
  let text = (decimalComma ? raw.replace(",", ".") : raw.replace(/,/g, "")).replace(/[^\d.]/g, "");
  if (decimals <= 0) return text.replace(/\./g, "");
  const dot = text.indexOf(".");
  if (dot >= 0) text = text.slice(0, dot + 1) + text.slice(dot + 1).replace(/\./g, "");
  const [whole, fraction] = text.split(".");
  const cleanWhole = whole.replace(/^0+(?=\d)/, "");
  return fraction === undefined ? cleanWhole : `${cleanWhole === "" ? "0" : cleanWhole}.${fraction.slice(0, decimals)}`;
}

/** True for a complete, positive amount with at most `decimals` fraction digits. */
export function isPositiveAmount(value: string, decimals: number): boolean {
  const pattern = decimals > 0 ? new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`) : /^\d+$/;
  return pattern.test(value) && Number(value) > 0;
}

/** "1250000.5" → "1,250,000.5" for reading back; never used as the stored value. */
export function groupThousands(value: string): string {
  if (!value) return "";
  const [whole, fraction] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/** Pads to the currency's decimals on leaving the field: "12.5" → "12.50" for USD, unchanged for RWF. */
export function padAmount(value: string, decimals: number): string {
  if (!value || decimals <= 0) return value;
  const [whole, fraction = ""] = value.split(".");
  return `${whole || "0"}.${fraction.padEnd(decimals, "0")}`;
}
