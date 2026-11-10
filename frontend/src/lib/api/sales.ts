import { request, qs, downloadFile, fetchFile } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";
import { periodParams, type PeriodRange } from "@/lib/period";

export interface ApiCustomer {
  credit_daily_limit?: string | number | null;
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  customer_type: string;
  tin?: string | null;
  is_active: boolean;
  created_at: string | null;
  archived_at?: string | null;
  /** active | inactive | archived */
  status?: CustomerStatus;
  /** Filled when the list is asked for figures (base currency, from the server). */
  orders_count?: number | null;
  total_spent?: string | number | null;
  last_order_at?: string | null;
  outstanding?: string | number | null;
}
export type CustomerStatus = "active" | "inactive" | "archived";
export type CustomerStatusFilter = "current" | "active" | "inactive" | "archived" | "all";
export interface CustomerActivity { id: string; action: string; summary: string; actor: string | null; changes: Record<string, unknown> | null; at: string }

export interface QuotationItem { id: string; product_id: string | null; variant_id: string | null; product_name: string; sku: string | null; unit_price: number; quantity: number; discount: number; line_total: number }
export type QuotationStatus = "Draft" | "Sent" | "Accepted" | "Rejected" | "Expired";
export interface ApiQuotation {
  id: string; quote_number: string; status: QuotationStatus;
  customer_id: string | null; customer: { id: string; name: string; email: string | null; phone: string | null; address: string | null; tin?: string | null } | null;
  salesperson_id: string | null; salesperson_name: string | null; branch_id: string | null; created_by: string | null;
  issue_date: string; expiry_date: string | null; subtotal: number; discount: number; tax: number; total: number;
  notes: string | null; terms: string | null; sent_at: string | null; decided_at: string | null; decision_reason: string | null;
  converted_order_id: string | null; converted_order_number: string | null; items: QuotationItem[]; created_at: string | null;
}
export interface QuotationInput {
  customer_id?: string | null; salesperson_id?: string | null; issue_date?: string | null; expiry_date?: string | null; discount?: number; notes?: string | null; terms?: string | null;
  items: { product_id?: string | null; variant_id?: string | null; product_name: string; sku?: string | null; unit_price: number; quantity: number; discount?: number }[];
}
export interface QuotationActivity { action: string; summary: string; by: string | null; at: string | null; details: Record<string, unknown> | null }
export interface TeamMember { id: string; name: string }
export interface SalespersonRow {
  salesperson_id: string | null; salesperson: string; orders: number; sales: number; returns: number; net_sales: number; collected: number; outstanding: number;
  awaiting_approval: { orders: number; value: number };
}
export interface SalespersonOrder {
  id: string; order_number: string; date: string; customer: string | null; salesperson_id: string | null; salesperson: string | null; approval_status: string;
  gross: number; discount: number; total: number; returns: number; collected: number; outstanding: number; items: { name: string; quantity: number }[];
}
export interface SalespersonTarget { id: string; name: string; salesperson_id: string; unit: string; period: string; target: number; actual: number; progress: number | null }
export interface SalespersonReport {
  from_date: string; to_date: string; currency: string; definitions: Record<string, string>; people: SalespersonRow[];
  totals: { orders: number; sales: number; returns: number; net_sales: number; collected: number; outstanding: number };
  targets: SalespersonTarget[]; orders?: SalespersonOrder[];
}
export interface SalespersonFilters { from_date?: string; to_date?: string; salesperson_id?: string; customer_id?: string; product_id?: string; category_id?: string; payment_status?: string }

export interface ApiDeal {
  id: string;
  name: string;
  value: number;
  stage: string;
  probability: number;
  customer_id: string | null;
  owner_id: string | null;
  expected_close_date: string | null;
  notes: string | null;
  customer: { id: string; name: string; email: string | null; phone: string | null; address: string | null; tin?: string | null } | null;
  created_at: string | null;
}

export interface ApiOrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  sku: string | null;
  variant_attributes: Record<string, string> | null;
  unit_price: number;
  quantity: number;
  discount: number;
  line_total: number;
  /** VAT frozen on the line when it was priced (null on sales from before line-level VAT). */
  tax_treatment?: VatTreatment | null;
  tax_code?: string | null;
  tax_rate?: number | null;
  taxable_base?: number | null;
  tax_amount?: number | null;
}

export interface ApiOrderPayment {
  id: string;
  tenant_id: string;
  reference: string;
  order_id: string;
  customer_id: string | null;
  branch_id: string | null;
  amount: number;
  payment_method: string | null;
  reference_number: string | null;
  notes: string | null;
  status: "Completed" | "Reversed";
  paid_at: string;
  received_by: string | null;
  received_by_name: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
  reversal_reason: string | null;
  created_at: string | null;
  // `amount` is in `currency_code`; `applied_amount` is what it took off the invoice (invoice
  // currency); `base_amount` is the cash in the tenant's base currency at `exchange_rate`.
  currency_code?: string | null;
  exchange_rate?: number | null;
  base_amount?: number | null;
  applied_amount?: number | null;
  base_applied_amount?: number | null;
}

export interface ApiOrder {
  discount_details?: { name: string; kind: string; type: string; amount: string; coupon_code?: string | null }[];
  original_subtotal?: number;
  total_discount?: number;
  id: string;
  order_number: string;
  customer_id: string | null;
  deal_id: string | null;
  branch_id: string | null;
  created_by: string | null;
  /** Who is credited with the sale (may differ from who entered it). */
  salesperson_id?: string | null;
  salesperson_name?: string | null;
  /** Why a held sale waits: the customer's credit limit, or the business approving every sale first. */
  held_reason?: "credit" | "policy" | null;
  approved_by?: string | null;
  approved_at?: string | null;
  approval_note?: string | null;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  notes: string | null;
  payment_method: string | null;
  amount_tendered: number | null;
  change_due: number | null;
  ordered_at: string | null;
  customer: { id: string; name: string; email: string | null; phone: string | null; address: string | null; tin?: string | null } | null;
  items: ApiOrderItem[];
  created_at: string | null;
  // Credit sales / partial payments
  amount_paid: number;
  due_date: string | null;
  outstanding_balance: number;
  payment_status: "Unpaid" | "PartiallyPaid" | "Paid";
  is_overdue: boolean;
  payments: ApiOrderPayment[];
  // Currency context. Amounts are in `currency_code` (null on rows from before multi-currency =
  // the tenant's base currency); `exchange_rate` is base-currency units per 1 unit of it, frozen
  // when the document became financially effective.
  currency_code?: string | null;
  exchange_rate?: number | null;
  base_subtotal?: number | null;
  base_discount?: number | null;
  base_tax?: number | null;
  base_total?: number | null;
  base_outstanding_balance?: number | null;
}

export interface ApiReturnItem {
  id: string;
  return_id: string;
  order_item_id: string | null;
  product_id: string | null;
  product_name: string;
  quantity: number;
  refund_per_unit: number;
  line_refund: number;
}

export interface ApiReturn {
  id: string;
  return_number: string;
  order_id: string | null;
  customer_id: string | null;
  reason: string | null;
  refund_amount: number;
  refund_method?: string;
  currency_code?: string | null;
  exchange_rate?: number | null;
  base_refund_amount?: number | null;
  status: string;
  processed_by: string | null;
  return_date: string;
  customer: { id: string; name: string; email: string | null; phone: string | null; address: string | null; tin?: string | null } | null;
  items: ApiReturnItem[];
  created_at: string | null;
}

export interface ApiTarget {
  id: string;
  name: string;
  target_value: number;
  achieved_value: number;
  unit: string;
  period: string;
  assigned_to: string | null;
  created_at: string | null;
}

const BASE = "/tenants/sales";

export type CustomerSection = "orders" | "payments" | "returns" | "debts";
export interface CustomerSectionPage { items: Record<string, string | number | boolean | null>[]; total: number; page?: number; page_size?: number; currency?: string }
export interface CustomerProfile {
  name: string; currency: string; deals: number | null;
  customer: { id: string; name: string; email: string | null; phone: string | null; address: string | null; customer_type: string; tin?: string | null; is_active: boolean; credit_daily_limit: string | null; created_at: string } | null;
  summary: { completed_orders?: number; lifetime_sales?: string; first_order_at?: string | null; last_order_at?: string | null; returns?: number; refunded?: string; outstanding?: string; overdue?: string };
  sections: Record<CustomerSection, CustomerSectionPage | null>;
}

export type VatMode = "inclusive" | "exclusive";
export type VatTreatment = "standard" | "zero_rated" | "exempt" | "out_of_scope" | "not_registered";
export interface TaxPreviewInput { items: { product_id?: string | null; variant_id?: string | null; line_total: number }[]; discount?: number }
export interface TaxPreviewLine { ref: string; treatment: VatTreatment; tax_code: string | null; rate: string; taxable_base: string; tax: string; gross: string }
export interface TaxPreview { mode: VatMode; registered: boolean; net: string; tax: string; gross: string; rate?: number; lines: TaxPreviewLine[]; breakdown: Partial<Record<VatTreatment, { base: string; tax: string; gross: string }>> }
/** Short labels shown on cart lines, receipts and the product list. */
export const VAT_LABELS: Record<VatTreatment, string> = { standard: "Standard", zero_rated: "Zero-rated", exempt: "Exempt", out_of_scope: "Out of scope", not_registered: "No VAT" };

export const salesApi = {
  // Customers
  getOrder: (id: string) => request<SingleResponse<ApiOrder>>(`${BASE}/orders/${encodeURIComponent(id)}`),
  vatRate: () => request<SingleResponse<{ enabled: boolean; rate: number; mode?: VatMode; vat_number?: string | null }>>(`${BASE}/vat-rate`),
  /** VAT for a cart from the server's tax engine (read-only): the till shows exactly what the checkout will record. */
  taxPreview: (body: TaxPreviewInput) => request<SingleResponse<TaxPreview>>(`${BASE}/tax/preview`, { method: "POST", body: JSON.stringify(body) }),
  customerProfile: (id: string) => request<SingleResponse<CustomerProfile>>(`${BASE}/customers/${encodeURIComponent(id)}/profile`),
  customerRecords: (id: string, section: CustomerSection, page: number) => request<SingleResponse<CustomerSectionPage>>(`${BASE}/customers/${encodeURIComponent(id)}/records/${section}${qs({ page, page_size: 10 })}`),
  listCustomers: (page = 1, pageSize = 20, search?: string, customerType?: string, period?: PeriodRange, status?: CustomerStatusFilter, figures?: boolean) =>
    request<PaginatedResponse<ApiCustomer>>(`${BASE}/customers${qs({ page, page_size: pageSize, search, customer_type: customerType, status, figures: figures ? "true" : undefined, ...periodParams(period) })}`),
  setCustomerStatus: (id: string, status: CustomerStatus) =>
    request<SingleResponse<ApiCustomer>>(`${BASE}/customers/${encodeURIComponent(id)}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  customerDependencies: (id: string) =>
    request<SingleResponse<{ linked: Record<string, number>; deletable: boolean }>>(`${BASE}/customers/${encodeURIComponent(id)}/dependencies`),
  customerActivity: (id: string, page = 1) =>
    request<PaginatedResponse<CustomerActivity>>(`${BASE}/customers/${encodeURIComponent(id)}/activity${qs({ page, page_size: 20 })}`),
  createCustomer: (data: object) =>
    request<SingleResponse<ApiCustomer>>(`${BASE}/customers`, { method: "POST", body: JSON.stringify(data) }),
  bulkCreateCustomers: (items: object[]) =>
    request<SingleResponse<{ created: number; skipped: number; failed: number; errors: string[] }>>(`${BASE}/customers/bulk`, { method: "POST", body: JSON.stringify({ items }) }),
  updateCustomer: (id: string, data: object) =>
    request<SingleResponse<ApiCustomer>>(`${BASE}/customers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteCustomer: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/customers/${id}`, { method: "DELETE" }),

  // Deals
  listDeals: (page = 1, pageSize = 100, stage?: string) =>
    request<PaginatedResponse<ApiDeal>>(`${BASE}/deals?page=${page}&page_size=${pageSize}${stage ? `&stage=${stage}` : ""}`),
  createDeal: (data: object) =>
    request<SingleResponse<ApiDeal>>(`${BASE}/deals`, { method: "POST", body: JSON.stringify(data) }),
  updateDeal: (id: string, data: object) =>
    request<SingleResponse<ApiDeal>>(`${BASE}/deals/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteDeal: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/deals/${id}`, { method: "DELETE" }),

  // Orders
  listOrders: (page = 1, pageSize = 20, status?: string, search?: string, paymentStatus?: string, period?: PeriodRange, archived?: boolean, salespersonId?: string) =>
    request<PaginatedResponse<ApiOrder>>(`${BASE}/orders${qs({ page, page_size: pageSize, status, search, payment_status: paymentStatus, archived: archived ? "true" : undefined, salesperson_id: salespersonId, ...periodParams(period) })}`),
  voidOrder: (id: string, reason: string) =>
    request<SingleResponse<ApiOrder>>(`${BASE}/orders/${id}/void`, { method: "POST", body: JSON.stringify({ reason }) }),
  requestVoid: (id: string, reason: string) =>
    request<SingleResponse<object>>(`${BASE}/orders/${id}/void-request`, { method: "POST", body: JSON.stringify({ reason }) }),
  correctOrder: (id: string, data: object) =>
    request<SingleResponse<ApiOrder>>(`${BASE}/orders/${id}/correct`, { method: "POST", body: JSON.stringify(data) }),
  archiveOrder: (id: string, reason: string) =>
    request<SingleResponse<ApiOrder>>(`${BASE}/orders/${id}/archive`, { method: "POST", body: JSON.stringify({ reason }) }),
  restoreOrder: (id: string) =>
    request<SingleResponse<ApiOrder>>(`${BASE}/orders/${id}/restore`, { method: "POST" }),
  createOrder: (data: object) =>
    request<SingleResponse<ApiOrder>>(`${BASE}/orders`, { method: "POST", body: JSON.stringify(data) }),
  bulkCreateOrders: (items: object[]) =>
    request<SingleResponse<{ created: number; failed: number; errors: string[] }>>(`${BASE}/orders/bulk`, { method: "POST", body: JSON.stringify({ items }) }),
  /** Credit sales held over the daily limit: GM/CEO (credit:approve) completes or declines them. */
  approveOrder: (id: string, note?: string) =>
    request<SingleResponse<ApiOrder>>(`${BASE}/orders/${id}/approve`, { method: "POST", body: JSON.stringify({ note: note ?? null }) }),
  rejectOrder: (id: string, note?: string) =>
    request<SingleResponse<ApiOrder>>(`${BASE}/orders/${id}/reject`, { method: "POST", body: JSON.stringify({ note: note ?? null }) }),
  updateOrder: (id: string, data: object) =>
    request<SingleResponse<ApiOrder>>(`${BASE}/orders/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteOrder: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/orders/${id}`, { method: "DELETE" }),
  invoiceFile: (id: string, orderNumber: string) =>
    fetchFile(`${BASE}/orders/${id}/invoice.pdf`, `invoice-${orderNumber}.pdf`),
  emailInvoice: (id: string, to: string | null, message: string | null, kind: "invoice" | "receipt" = "invoice") =>
    request<SingleResponse<{ sent_to: string }>>(`${BASE}/orders/${id}/invoice/email`, { method: "POST", body: JSON.stringify({ kind, to: to || null, message: message || null }) }),
  downloadInvoicePdf: (id: string, orderNumber: string) =>
    downloadFile(`${BASE}/orders/${id}/invoice.pdf`, `invoice-${orderNumber}.pdf`),
  /** The till receipt at thermal-paper width (black text only, the business's branding). A4 paper is the invoice. */
  receiptFile: (id: string, orderNumber: string, paper: "58mm" | "80mm" = "80mm") =>
    fetchFile(`${BASE}/orders/${id}/receipt.pdf?paper=${paper}`, `receipt-${orderNumber}.pdf`),
  downloadReceiptPdf: (id: string, orderNumber: string, paper: "58mm" | "80mm" = "80mm") =>
    downloadFile(`${BASE}/orders/${id}/receipt.pdf?paper=${paper}`, `receipt-${orderNumber}.pdf`),

  // Salespeople, quotations
  team: () => request<SingleResponse<TeamMember[]>>(`${BASE}/team`),
  changeSalesperson: (id: string, salesperson_id: string, reason: string) =>
    request<SingleResponse<ApiOrder>>(`${BASE}/orders/${id}/salesperson`, { method: "PATCH", body: JSON.stringify({ salesperson_id, reason }) }),
  listQuotations: (page = 1, pageSize = 25, f: { status?: string; search?: string; salesperson_id?: string } = {}) =>
    request<PaginatedResponse<ApiQuotation>>(`${BASE}/quotations${qs({ page, page_size: pageSize, ...f })}`),
  getQuotation: (id: string) => request<SingleResponse<ApiQuotation>>(`${BASE}/quotations/${id}`),
  quotationActivity: (id: string) => request<SingleResponse<QuotationActivity[]>>(`${BASE}/quotations/${id}/activity`),
  createQuotation: (data: QuotationInput) => request<SingleResponse<ApiQuotation>>(`${BASE}/quotations`, { method: "POST", body: JSON.stringify(data) }),
  updateQuotation: (id: string, data: Partial<QuotationInput>) => request<SingleResponse<ApiQuotation>>(`${BASE}/quotations/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  quotationAction: (id: string, action: "send" | "accept" | "convert") => request<SingleResponse<ApiQuotation>>(`${BASE}/quotations/${id}/${action}`, { method: "POST" }),
  rejectQuotation: (id: string, reason: string) => request<SingleResponse<ApiQuotation>>(`${BASE}/quotations/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
  quotationFile: (id: string, number: string) => fetchFile(`${BASE}/quotations/${id}/quotation.pdf`, `quotation-${number}.pdf`),
  downloadQuotationPdf: (id: string, number: string) => downloadFile(`${BASE}/quotations/${id}/quotation.pdf`, `quotation-${number}.pdf`),

  // Order payments (credit sales / partial payments)
  listOrderPayments: (orderId: string) =>
    request<SingleResponse<ApiOrderPayment[]>>(`${BASE}/orders/${orderId}/payments`),
  recordOrderPayment: (orderId: string, data: object) =>
    request<SingleResponse<ApiOrder>>(`${BASE}/orders/${orderId}/payments`, { method: "POST", body: JSON.stringify(data) }),
  reverseOrderPayment: (paymentId: string, reason?: string) =>
    request<SingleResponse<ApiOrder>>(`${BASE}/payments/${paymentId}/reverse`, { method: "POST", body: JSON.stringify({ reason }) }),

  // Returns
  listReturns: (page = 1, pageSize = 100, status?: string, period?: PeriodRange) =>
    request<PaginatedResponse<ApiReturn>>(`${BASE}/returns${qs({ page, page_size: pageSize, status, ...periodParams(period) })}`),
  createReturn: (data: object) =>
    request<SingleResponse<ApiReturn>>(`${BASE}/returns`, { method: "POST", body: JSON.stringify(data) }),
  updateReturn: (id: string, data: object) =>
    request<SingleResponse<ApiReturn>>(`${BASE}/returns/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteReturn: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/returns/${id}`, { method: "DELETE" }),

  // Targets
  listTargets: (page = 1, pageSize = 100, period?: string) =>
    request<PaginatedResponse<ApiTarget>>(`${BASE}/targets?page=${page}&page_size=${pageSize}${period ? `&period=${encodeURIComponent(period)}` : ""}`),
  createTarget: (data: object) =>
    request<SingleResponse<ApiTarget>>(`${BASE}/targets`, { method: "POST", body: JSON.stringify(data) }),
  updateTarget: (id: string, data: object) =>
    request<SingleResponse<ApiTarget>>(`${BASE}/targets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteTarget: (id: string) =>
    request<SingleResponse<null>>(`${BASE}/targets/${id}`, { method: "DELETE" }),
};
