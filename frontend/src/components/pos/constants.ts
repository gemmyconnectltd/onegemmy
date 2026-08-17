export const PAYMENT_METHODS = [
  { id: "cash",    label: "Cash",         icon: "banknote"    },
  { id: "mobile",  label: "Mobile Money", icon: "smartphone"  },
  { id: "card",    label: "Card",         icon: "credit-card" },
] as const;

export const CASH_PRESETS = [0, 1000, 5000, 10000, 20000, 50000];
export const DISCOUNT_PRESETS = [5, 10, 15, 20, 25, 50]; // percent
export const LOW_STOCK_THRESHOLD = 5;
export const TAX_RATE = 0.18;

export function generateOrderId() {
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);
  return `ORD-${stamp}`;
}

export function timeLabel() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
