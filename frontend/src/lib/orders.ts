import type { ApiOrder } from "@/lib/api";
import type { CartItem, PaymentMethod, SaleResult } from "@/components/pos/types";

const METHODS: readonly PaymentMethod[] = ["cash", "mobile", "card"];

// Mobile/desktop POS stamp the payment method into the order notes as
// `POS — <method>`. Parse it back out so reports can break sales down by
// payment method even though the orders API doesn't store it explicitly.
export function parsePaymentFromNotes(notes: string | null | undefined): PaymentMethod | null {
  if (!notes) return null;
  const m = notes.match(/POS\s*[—\-–:]\s*(\w+)/i);
  if (!m) return null;
  const v = m[1].toLowerCase();
  return (METHODS as readonly string[]).includes(v) ? (v as PaymentMethod) : null;
}

/** The sale's VAT by treatment, read from each line's frozen snapshot (never recomputed from today's product settings). */
function vatSummary(o: ApiOrder): Pick<SaleResult, "vatBreakdown" | "vatExclusive"> {
  const lines = (o.items ?? []).filter((i) => i.tax_treatment);
  if (!lines.length) return {};
  const groups = new Map<string, { treatment: string; rate: number; base: number; tax: number }>();
  for (const line of lines) {
    const key = `${line.tax_treatment}:${line.tax_rate ?? 0}`;
    const group = groups.get(key) ?? { treatment: line.tax_treatment!, rate: Number(line.tax_rate ?? 0), base: 0, tax: 0 };
    group.base = Math.round((group.base + Number(line.taxable_base ?? 0)) * 100) / 100;
    group.tax = Math.round((group.tax + Number(line.tax_amount ?? 0)) * 100) / 100;
    groups.set(key, group);
  }
  const net = Math.round(((o.original_subtotal ?? o.subtotal) - (o.total_discount ?? o.discount)) * 100) / 100;
  return { vatBreakdown: [...groups.values()], vatExclusive: o.tax > 0 && o.total > net + 0.005 };
}

export function orderToSale(o: ApiOrder): SaleResult {
  const payment = METHODS.includes(o.payment_method as PaymentMethod) ? o.payment_method as PaymentMethod : parsePaymentFromNotes(o.notes) ?? "cash";
  const items: CartItem[] = (o.items ?? []).map((i) => ({
    id: i.id,
    product_id: i.product_id ?? undefined,
    variant_id: i.variant_id,
    name: i.product_name,
    price: i.unit_price,
    qty: i.quantity,
    emoji: "📦",
    discount: i.discount,
    image_url: null,
    sku: i.sku,
    variant_attributes: i.variant_attributes,
  }));
  return {
    orderId: o.order_number,
    backendOrderId: o.id,
    payment,
    customerName: o.customer?.name ?? "Walk-in",
    customerTin: o.customer?.tin ?? null,
    notes: o.notes ?? "",
    items,
    discountDetails: o.discount_details ?? [],
    subtotal: o.original_subtotal ?? o.subtotal,
    discount: o.total_discount ?? o.discount,
    tax: o.tax,
    total: o.total,
    ...vatSummary(o),
    cashGiven: o.amount_tendered == null ? "" : String(o.amount_tendered),
    change: o.change_due ?? 0,
    amountPaid: o.amount_paid,
    balanceDue: o.outstanding_balance,
    dueDate: o.due_date,
    timestamp: new Date(o.ordered_at ?? o.created_at ?? Date.now()),
  };
}
