export const PAYMENT_METHODS = [
  { id: "cash", label: "Cash", icon: "banknote" },
  { id: "mobile", label: "Mobile Money", icon: "smartphone" },
  { id: "card", label: "Card", icon: "credit-card" },
  { id: "invoice", label: "Invoice", icon: "file-text" },
] as const;

export const CASH_PRESETS = [0, 1000, 5000, 10000];
export const DISCOUNT_PRESETS = [0, 5, 10, 15];
export const LOW_STOCK_THRESHOLD = 5;
export const TAX_RATE = 0.18;

export function generateOrderId() {
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  return `ORD-${stamp}`;
}

export function generateInvoiceId() {
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  return `INV-${stamp}`;
}

export function timeLabel() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
