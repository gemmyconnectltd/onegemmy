import { TableScroll } from "@/components/ui/TableScroll";
import {
  BadgeCheck, Clock, FileText, AlertCircle, CalendarClock,
} from "lucide-react";
import { resolveUploadUrl } from "@/lib/api/client";
import { formatMoney } from "@/lib/money";
import { customerNote } from "@/lib/orders";
import type { ApiOrder, Tenant } from "@/lib/api";
import { saleDocument } from "@/lib/documentWords";

// The backend's Order.status is stored Title Case ("Pending"/"Completed"/
// "Cancelled") — these keys must match exactly, not just read as labels.
// This is the order's FULFILLMENT state — whether the sale itself went
// through — deliberately distinct from payment_status (below), which is
// whether the customer has actually paid for it. A Completed order can
// still be Unpaid (a credit sale) or PartiallyPaid.
const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: React.ElementType }> = {
  Pending:   { label: "Pending",   bg: "bg-amber-100",   text: "text-amber-700",   icon: Clock },
  Completed: { label: "Completed", bg: "bg-emerald-100", text: "text-emerald-700", icon: BadgeCheck },
  Cancelled: { label: "Cancelled", bg: "bg-red-100",     text: "text-red-600",     icon: AlertCircle },
  Draft:     { label: "Draft",     bg: "bg-slate-100",   text: "text-slate-600",   icon: FileText },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.Draft;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
      <Icon size={11} /> {cfg.label}
    </span>
  );
}

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: React.ElementType }> = {
  Paid:           { label: "Paid",           bg: "bg-emerald-100", text: "text-emerald-700", icon: BadgeCheck },
  PartiallyPaid:  { label: "Partially Paid", bg: "bg-amber-100",   text: "text-amber-700",   icon: Clock },
  Unpaid:         { label: "Unpaid",         bg: "bg-red-100",     text: "text-red-600",     icon: AlertCircle },
};

export function PaymentStatusBadge({ paymentStatus, isOverdue }: { paymentStatus: string; isOverdue?: boolean }) {
  const cfg = PAYMENT_STATUS_CONFIG[paymentStatus] ?? PAYMENT_STATUS_CONFIG.Unpaid;
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
        <Icon size={11} /> {cfg.label}
      </span>
      {isOverdue && (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-red-100 text-red-600">
          <CalendarClock size={11} /> Overdue
        </span>
      )}
    </span>
  );
}

// ── The A4 invoice ("D4" layout): the same document as the server PDF (sales/service/invoice_pdf.py), so print, download and
// share all match. Issued by the business: its logo, name and details, printed in black only, closing like the receipt.
// Empty fields leave no line.

const TREATMENT: Record<string, string> = { standard: "Standard", zero_rated: "Zero-rated", exempt: "Exempt", out_of_scope: "Out of scope" };
const METHOD: Record<string, string> = { cash: "Cash", mobile: "Mobile money", momo: "Mobile money", mobile_money: "Mobile money", card: "Card", bank: "Bank transfer", bank_transfer: "Bank transfer", credit: "On credit", split: "Split" };
const method = (v?: string | null) => (v ? METHOD[v.toLowerCase()] ?? v : "");
const day = (v?: string | null) => (v ? new Date(v.length === 10 ? `${v}T00:00:00` : v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "");
const initials = (name?: string | null) => (name ?? "").split(/\W+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "•";

/** The business's contact lines, in the same order as the PDF (core/brand_pdf.business_contact_lines). */
function contactLines(t?: Tenant): string[] {
  if (!t) return [];
  const lines: string[] = [];
  if (t.address) lines.push(t.address);
  if (t.city || t.country) lines.push([t.city, t.country].filter(Boolean).join(", "));
  if (t.phone) lines.push(`Tel: ${t.phone}`);
  if (t.email) lines.push(`Email: ${t.email}`);
  if (t.website) lines.push(t.website);
  const ids = [t.tin ? `TIN: ${t.tin}` : "", t.vat_enabled && t.vat_number ? `VAT No: ${t.vat_number}` : ""].filter(Boolean);
  if (ids.length) lines.push(ids.join(" · "));
  return lines;
}

/** One status: void, not yet a sale, or how far it is paid (plus Overdue). */
function statusPills(o: ApiOrder): { label: string; tone: "success" | "warning" | "error" | "neutral" }[] {  // tone kept for meaning; the invoice shows every pill in black
  if (o.status === "Cancelled") return [{ label: "Void", tone: "error" }];
  if (o.status !== "Completed") return [{ label: o.status, tone: "neutral" }];
  const paid = o.payment_status === "Paid" ? { label: "Paid", tone: "success" as const } : o.payment_status === "PartiallyPaid" ? { label: "Partially paid", tone: "warning" as const } : { label: "Unpaid", tone: "error" as const };
  return o.is_overdue ? [paid, { label: "Overdue", tone: "error" }] : [paid];
}

function taxLabel(treatment?: string | null, rate?: number | null): string {
  if (treatment === "standard") return `${Number(rate ?? 0)}%`;
  if (treatment === "zero_rated") return "0%";
  return TREATMENT[treatment ?? ""] && treatment !== "standard" ? TREATMENT[treatment!] : "";
}

/** Net amount and VAT per treatment, from what was frozen on each line when it was priced. */
function vatSummary(o: ApiOrder): { name: string; net: number; vat: number | null }[] {
  const groups = new Map<string, { treatment: string; rate: number; net: number; vat: number }>();
  for (const i of o.items) {
    if (!i.tax_treatment || !TREATMENT[i.tax_treatment] || i.taxable_base == null) continue;
    const key = `${i.tax_treatment}:${Number(i.tax_rate ?? 0)}`;
    const g = groups.get(key) ?? { treatment: i.tax_treatment, rate: Number(i.tax_rate ?? 0), net: 0, vat: 0 };
    g.net += Number(i.taxable_base); g.vat += Number(i.tax_amount ?? 0);
    groups.set(key, g);
  }
  const order = ["standard", "zero_rated", "exempt", "out_of_scope"];
  return [...groups.values()].sort((a, b) => order.indexOf(a.treatment) - order.indexOf(b.treatment)).map((g) => ({
    name: g.treatment === "standard" ? `Standard ${g.rate}%` : g.treatment === "zero_rated" ? "Zero-rated 0%" : TREATMENT[g.treatment],
    net: g.net, vat: g.treatment === "exempt" ? null : g.vat,
  }));
}

/** The invoice/order document: shared by every place an order is shown or printed as an invoice (Accounting > Invoices, Sales). */
export function InvoiceDocument({ order, tenant, onReversePayment }: {
  order: ApiOrder; tenant: Tenant | undefined;
  /** Kept for callers; the invoice is printed in black only, like the PDF. */
  brandColor: string;
  /** Kept for callers; amounts are shown in the order's own currency with its code, like the PDF. */
  fmt: (v: number) => string;
  /** Optional — only the interactive on-screen instance should pass this, not the print portal's. The button is print:hidden. */
  onReversePayment?: (paymentId: string) => void;
}) {
  const base = tenant?.currency || "USD";
  const currency = order.currency_code || base;
  const m = (v: number | string | null | undefined) => formatMoney(Number(v ?? 0), currency, { showCode: true });
  const name = tenant?.name || "";
  const showDiscount = order.items.some((i) => Number(i.discount) > 0);
  const showTax = order.items.some((i) => !!i.tax_treatment && !!TREATMENT[i.tax_treatment]);
  const inclusive = (tenant?.vat_pricing_mode ?? "inclusive") === "inclusive";
  const vat = vatSummary(order);
  const owing = order.status === "Completed" && Number(order.outstanding_balance) > 0;
  const terms = (tenant?.quotation_terms ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const showPayment = order.payments.length > 0 || owing || terms.length > 0;
  const note = customerNote(order.notes);
  // The title follows the number: INV-/ORD- is an INVOICE, SO- (saved before it was completed) a SALES ORDER.
  const doc = saleDocument(order.order_number);
  const meta = [
    [doc.dateLabel, day(order.ordered_at)],
    ["Due date", owing && order.due_date ? day(order.due_date) : ""],
    ["Order ref.", order.sales_order_number ?? ""],
    ["Quotation ref.", order.quotation_number ?? ""],
    ["Currency", currency],
    ["Payment", method(order.payment_method)],
    ["Served by", order.salesperson_name ?? ""],
  ].filter(([, v]) => v);
  const totalRow = (k: string, v: string) => <div key={k} className="flex justify-between gap-4 py-1"><span className="text-muted">{k}</span><span className="tabular-nums text-foreground">{v}</span></div>;
  const caption = "text-[10px] font-semibold uppercase tracking-wider";

  return (
    // Print the brand rule, status pills and tints as they look on screen (browsers drop background colours by default).
    <div className="pesaa-paper flex h-full flex-col text-foreground" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
      <div className="h-1 shrink-0 bg-foreground" />
      <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8 print:overflow-visible">
        {/* Header: the business on the left; INVOICE, number and status on the right */}
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {tenant?.logo_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={resolveUploadUrl(tenant.logo_url) ?? undefined} alt={name} className="h-14 max-w-[9rem] object-contain object-left" />
              : <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-foreground text-xl font-semibold text-card" aria-hidden>{initials(name)}</div>}
            <p className="mt-3 text-xl font-bold leading-tight text-foreground">{name}</p>
            <div className="mt-1 space-y-0.5 text-xs text-muted">{contactLines(tenant).map((l) => <p key={l}>{l}</p>)}</div>
          </div>
          <div className="sm:text-right">
            <p className="text-3xl font-light uppercase tracking-[0.18em] text-foreground">{doc.title}</p>
            <p className="mt-1 text-sm"><span className="text-xs text-muted">{doc.title} no.</span>{" "}<span className="font-mono font-semibold text-foreground">{order.order_number}</span></p>
            <div className="mt-2 flex flex-wrap gap-1.5 sm:justify-end">
              {statusPills(order).map((p) => <span key={p.label} className="pesaa-badge bg-foreground uppercase text-card">{p.label}</span>)}
            </div>
          </div>
        </header>

        <hr className="my-6 border-border" />

        {/* Bill to, and the invoice facts */}
        <section className="flex flex-col gap-5 sm:flex-row sm:justify-between">
          <div className="min-w-0">
            <p className={`${caption} text-foreground`}>Bill to</p>
            {order.customer ? <>
              <p className="mt-1.5 text-sm font-bold text-foreground">{order.customer.name}</p>
              <div className="mt-0.5 space-y-0.5 text-xs text-muted">
                {order.customer.address && <p>{order.customer.address}</p>}
                {(order.customer.phone || order.customer.email) && <p>{[order.customer.phone, order.customer.email].filter(Boolean).join(" · ")}</p>}
                {order.customer.tin && <p>TIN {order.customer.tin}</p>}
              </div>
            </> : <p className="mt-1.5 text-sm font-bold text-foreground">Walk-in customer</p>}
          </div>
          {meta.length > 0 && (
            <dl className="w-full text-xs sm:w-60">
              {meta.map(([k, v]) => <div key={k} className="flex justify-between gap-4 border-b border-border py-1.5 last:border-0"><dt className="text-muted">{k}</dt><dd className="text-right font-semibold text-foreground">{v}</dd></div>)}
            </dl>
          )}
        </section>

        {/* Line items: Discount and Tax columns only when some line has them */}
        <div className="mt-7">
          <TableScroll><table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-[10px] uppercase tracking-wider text-muted">
                <th className="w-8 px-2 py-2 text-center font-semibold">#</th>
                <th className="px-2 py-2 text-left font-semibold">Description</th>
                <th className="px-2 py-2 text-right font-semibold">Qty</th>
                <th className="px-2 py-2 text-right font-semibold">Unit price</th>
                {showDiscount && <th className="px-2 py-2 text-right font-semibold">Discount</th>}
                {showTax && <th className="px-2 py-2 text-center font-semibold">Tax</th>}
                <th className="px-2 py-2 text-right font-semibold">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {order.items.map((item, n) => (
                <tr key={item.id} className="align-top">
                  <td className="px-2 py-2.5 text-center text-xs text-muted">{n + 1}</td>
                  <td className="px-2 py-2.5"><p className="text-foreground">{item.product_name}</p>{item.sku && <p className="font-mono text-[11px] text-muted">{item.sku}</p>}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{Number(item.quantity)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{m(item.unit_price)}</td>
                  {showDiscount && <td className="px-2 py-2.5 text-right tabular-nums text-muted">{Number(item.discount) > 0 ? m(item.discount) : "—"}</td>}
                  {showTax && <td className="px-2 py-2.5 text-center text-xs">{taxLabel(item.tax_treatment, item.tax_rate) || "—"}</td>}
                  <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{m(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table></TableScroll>
          {showTax && <p className="mt-1.5 text-[11px] text-muted">{inclusive ? "Prices include VAT." : "Prices exclude VAT; VAT is added in the totals."}</p>}
        </div>

        {/* Left: VAT summary and payment information. Right: totals. */}
        <section className="mt-7 grid gap-7 sm:grid-cols-[minmax(0,1fr)_17.5rem]">
          <div className="min-w-0 space-y-5">
            {vat.length > 0 && (Number(order.tax) > 0 || vat.length > 1) && (
              <div>
                <p className={`${caption} text-muted`}>VAT summary</p>
                <table className="mt-1.5 w-full text-xs">
                  <thead><tr className="border-b border-border text-muted"><th className="py-1 text-left font-normal">Tax rate</th><th className="py-1 text-right font-normal">Net amount</th><th className="py-1 text-right font-normal">VAT</th></tr></thead>
                  <tbody>{vat.map((r) => <tr key={r.name}><td className="py-1 text-foreground">{r.name}</td><td className="py-1 text-right tabular-nums">{m(r.net)}</td><td className="py-1 text-right tabular-nums">{r.vat == null ? "—" : m(r.vat)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
            {showPayment && (
              <div className="rounded-lg bg-surface p-4 text-xs">
                <p className={`${caption} text-muted`}>Payment information</p>
                <div className="mt-2 space-y-1.5">
                  {order.payments.map((p) => {
                    const reversed = p.status === "Reversed";
                    const bits = [day(p.paid_at), method(p.payment_method), p.reference_number ? `ref. ${p.reference_number}` : ""].filter(Boolean).join(" · ");
                    return (
                      <div key={p.id} className={`flex items-start justify-between gap-3 ${reversed ? "print:hidden" : ""}`}>
                        <p className={reversed ? "text-muted line-through" : "text-foreground"}>Received {m(p.amount)}{bits ? ` · ${bits}` : ""}{reversed ? ` — reversed${p.reversal_reason ? `: ${p.reversal_reason}` : ""}` : ""}</p>
                        {!reversed && p.status === "Completed" && onReversePayment && (
                          <button type="button" onClick={() => onReversePayment(p.id)} className="shrink-0 font-semibold text-destructive hover:underline print:hidden">Reverse</button>
                        )}
                      </div>
                    );
                  })}
                  {owing && <p className="text-foreground">Please quote <strong>{order.order_number}</strong> as the payment reference.</p>}
                  {terms.map((l, n) => <p key={n} className="text-foreground">{l}</p>)}
                </div>
              </div>
            )}
          </div>

          <div className="text-sm">
            {totalRow("Subtotal", m(order.subtotal))}
            {Number(order.discount) > 0 && totalRow("Discount", `− ${m(order.discount)}`)}
            {(Number(order.tax) > 0 || showTax) && <>
              {totalRow("Amount excl. VAT", m(Number(order.total) - Number(order.tax)))}
              {totalRow(inclusive ? "VAT (included)" : "VAT", m(order.tax))}
            </>}
            <div className="mt-1 flex items-center justify-between gap-4 border-t-2 border-foreground py-3">
              <span className="font-semibold">Grand total</span><span className="text-lg font-bold tabular-nums">{m(order.total)}</span>
            </div>
            {currency !== base && order.base_total != null && order.exchange_rate != null && <>
              {totalRow(`In ${base}`, formatMoney(Number(order.base_total), base, { showCode: true }))}
              {totalRow("Exchange rate", `1 ${currency} = ${formatMoney(Number(order.exchange_rate), base, { showCode: true })}`)}
            </>}
            {order.status === "Completed" && <>
              <div className="border-t border-border pt-1">{totalRow("Amount paid", Number(order.amount_paid) ? `− ${m(order.amount_paid)}` : m(0))}</div>
              <div className="mt-1 flex items-center justify-between gap-4 rounded-b-lg bg-surface px-3 py-2.5">
                <span className="font-semibold">Balance due</span><span className="text-base font-bold tabular-nums text-foreground">{m(order.outstanding_balance)}</span>
              </div>
            </>}
          </div>
        </section>

        {note && <div className="mt-7"><p className={`${caption} text-muted`}>Notes</p><p className="mt-1 text-sm text-foreground">{note}</p></div>}
        {/* The same closing as the receipt (ReceiptDocument) */}
        <footer className="mt-7 border-t border-dashed border-border pt-3 text-center">
          <p className="text-[13px] font-semibold text-foreground">Thank you for shopping with {tenant?.name?.trim() || "us"}!</p>
          <p className="mt-0.5 text-[11px] text-muted">We look forward to seeing you again.</p>
          <p className="mt-3 border-t border-dashed border-border pt-2 text-[10px] tracking-wide text-muted">Powered by <strong className="font-semibold text-foreground">Pesaa</strong></p>
        </footer>
      </div>

    </div>
  );
}
