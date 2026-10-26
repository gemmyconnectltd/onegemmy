import type { SaleResult, PaymentMethod } from "@/components/pos/types";
import type { ApiOrder } from "@/lib/api/sales";

const method = (value: string | null): PaymentMethod => value === "mobile" || value === "card" ? value : "cash";

/** Adapts any saved order to the POS receipt model, so the one receipt layout can render a sale from anywhere. */
export function orderToSale(order: ApiOrder, cashierName?: string): SaleResult {
  return {
    cashierName, orderId: order.order_number, backendOrderId: order.id, payment: method(order.payment_method),
    customerName: order.customer?.name ?? "", notes: order.notes ?? "",
    items: order.items.map(item => ({ id: item.id, product_id: item.product_id ?? undefined, variant_id: item.variant_id, name: item.product_name, price: item.unit_price, qty: item.quantity, emoji: "", discount: item.discount, sku: item.sku, variant_attributes: item.variant_attributes })),
    subtotal: order.subtotal, discount: order.discount, tax: order.tax, total: order.total, cashGiven: "", change: order.change_due ?? 0,
    timestamp: new Date(order.ordered_at ?? order.created_at ?? Date.now()), amountPaid: order.amount_paid,
    balanceDue: order.outstanding_balance, dueDate: order.due_date,
  };
}
