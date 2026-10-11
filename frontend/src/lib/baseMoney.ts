// Base-currency accessors for documents that may be in a foreign currency.
//
// A document's own amounts (`total`, `tax`, `amount`, …) are in ITS currency — which can differ from the
// business's base currency and from other documents'. Anything that adds documents together (totals,
// stat cards, reports) must therefore add their BASE-currency values, never the raw fields: summing
// `o.total` over a USD invoice and an RWF one is meaningless. The server fills the `base_*` fields at the
// document's frozen exchange rate; for rows from before multi-currency (null) the document was already in
// the base currency, so the raw amount is the base amount.

interface WithCurrency {
  currency_code?: string | null;
}

export interface OrderMoney extends WithCurrency {
  total: number;
  tax: number;
  discount: number;
  subtotal?: number;
  outstanding_balance: number;
  base_total?: number | null;
  base_tax?: number | null;
  base_discount?: number | null;
  base_subtotal?: number | null;
  base_outstanding_balance?: number | null;
}

export const orderBaseTotal = (o: OrderMoney) => o.base_total ?? o.total;
export const orderBaseTax = (o: OrderMoney) => o.base_tax ?? o.tax;
export const orderBaseDiscount = (o: OrderMoney) => o.base_discount ?? o.discount;
export const orderBaseOutstanding = (o: OrderMoney) => o.base_outstanding_balance ?? o.outstanding_balance;
/** Collected so far, in base currency at the invoice's own rate (total − still owed). */
export const orderBasePaid = (o: OrderMoney) => orderBaseTotal(o) - orderBaseOutstanding(o);

export const returnBaseRefund = (r: WithCurrency & { refund_amount: number; base_refund_amount?: number | null }) =>
  r.base_refund_amount ?? r.refund_amount;

export const expenseBaseAmount = (e: WithCurrency & { amount: number; base_amount?: number | null }) => e.base_amount ?? e.amount;

export const purchaseBaseTotal = (p: WithCurrency & { total: number; base_total?: number | null }) => p.base_total ?? p.total;

/** The currency a document is denominated in; null/absent means the business's base currency. */
export const docCurrency = (doc: WithCurrency, baseCurrency: string) => doc.currency_code || baseCurrency;

/** true when the document is in a currency other than the business's base currency. */
export const isForeign = (doc: WithCurrency, baseCurrency: string) => !!doc.currency_code && doc.currency_code !== baseCurrency;
