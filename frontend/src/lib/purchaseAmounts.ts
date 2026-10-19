// Purchase cost is two decimals; received quantity supports three decimals.
export function scaled(value: string, places: number): bigint | null {
  if (!new RegExp(`^\\d{1,10}(?:\\.\\d{1,${places}})?$`).test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(10) ** BigInt(places) + BigInt(fraction.padEnd(places, "0"));
}
export function purchaseLineMinor(cost: string, quantity: string): bigint | null {
  const price = scaled(cost, 2), units = scaled(quantity, 3);
  return price === null || units === null || units <= BigInt(0) ? null : (price * units + BigInt(500)) / BigInt(1000);
}
