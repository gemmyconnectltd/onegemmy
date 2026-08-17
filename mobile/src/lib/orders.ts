import type { ApiOrder } from "@/lib/api";
import type { CartItem, PaymentMethod, SaleResult } from "@/components/pos/types";

const METHODS: readonly PaymentMethod[] = ["cash", "mobile", "card", "invoice"];

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

export function orderToSale(o: ApiOrder): SaleResult {
  const payment = parsePaymentFromNotes(o.notes) ?? "cash";
  const items: CartItem[] = (o.items ?? []).map((i) => ({
    id: i.id,
    product_id: i.product_id ?? undefined,
    variant_id: i.variant_id,
    name: i.product_name,
    price: i.unit_price,
    qty: i.quantity,
    stock: 0,
    emoji: "📦",
    discount: i.discount,
    image_url: null,
    sku: i.sku,
    variant_attributes: i.variant_attributes,
  }));
  return {
    orderId: o.order_number,
    invoiceNumber: payment === "invoice" ? o.order_number : null,
    isInvoice: payment === "invoice",
    payment,
    customerName: o.customer?.name ?? "Walk-in",
    notes: o.notes ?? "",
    items,
    subtotal: o.subtotal,
    discount: o.discount,
    tax: o.tax,
    total: o.total,
    cashGiven: "",
    change: 0,
    timestamp: new Date(o.ordered_at ?? o.created_at ?? Date.now()),
  };
}
