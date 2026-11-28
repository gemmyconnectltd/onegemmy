"use client";

import { VAT_LABELS } from "@/lib/api/sales";
import { useRef, useState } from "react";
import { AlertCircle, Banknote, Calendar, CreditCard, Plus, Smartphone, SplitSquareHorizontal, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import type { PaymentMethod } from "./types";
import type { ApiCustomer } from "@/lib/api";
import { DebtCustomer } from "./DebtCustomer";
import { useCustomerDebtSnapshot } from "@/lib/api/hooks";
import { useCan } from "@/lib/can";
import { useDisabledPayMethods } from "@/lib/useFeatureActions";

/** What the cashier confirmed for this sale: the payments taken now and any balance left as a debt. */
export interface Checkout {
  kind: "single" | "split" | "credit";
  payments: { method: PaymentMethod; amount: number; reference?: string; tendered?: number }[];
  paid: number;
  outstanding: number;
  dueDate: string | null;
  change: number;
}

type Tab = PaymentMethod | "split" | "credit";
interface SplitEntry { id: number; method: PaymentMethod; amount: string; reference: string }

const METHODS: { id: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { id: "cash", label: "Cash", icon: Banknote },
  { id: "mobile", label: "Mobile Money", icon: Smartphone },
  { id: "card", label: "Card", icon: CreditCard },
  { id: "bank", label: "Bank transfer", icon: Banknote },
];

const inDays = (n: number) => () => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const endOfMonth = () => { const d = new Date(); const e = new Date(d.getFullYear(), d.getMonth() + 1, 0); return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`; };
const isoToday = () => inDays(0)();
const DUE_CHOICES: { label: string; date: () => string }[] = [{ label: "7 days", date: inDays(7) }, { label: "14 days", date: inDays(14) }, { label: "30 days", date: inDays(30) }, { label: "End of month", date: endOfMonth }];

interface PaymentPanelProps {
  payment: PaymentMethod;
  cashGiven: string;
  subtotal: number;
  discount: number;
  discountBreakdown?: { product: number; order: number; coupon: number };
  tax: number;
  total: number;
  cartCount: number;
  hasCustomer: boolean;
  customerName?: string;
  customerId?: string | null;
  /** For picking (or adding) who owes the balance of a partial or credit sale, right in the checkout. */
  customers?: ApiCustomer[];
  onCustomerChange?: (id: string, name: string) => void;
  dueDate: string;
  vatEnabled: boolean;
  vatRate?: number;
  /** inclusive: prices contain VAT; exclusive: VAT is added on top. */
  vatMode?: "inclusive" | "exclusive";
  /** Sales by VAT treatment, from the server's tax engine. */
  vatBreakdown?: Partial<Record<string, { base: string; tax: string; gross: string }>>;
  currencySymbol: string;
  fmt: (v: number) => string;
  saving?: boolean;
  pricingPending?: boolean;
  checkoutBlocked?: boolean;
  /** Why pricing keeps the sale from completing, shown under the button. */
  blockedReason?: string | null;
  onRetryPricing?: () => void;
  approvalPending?: boolean;
  saleError?: string | null;
  /** Sum of cash recorded per cart line, when itemizing instead of one lump sum. */
  itemsCashReceivedSum?: number;
  notes?: string;
  onNotesChange?: (v: string) => void;
  onPaymentChange: (m: PaymentMethod) => void;
  onCashChange: (v: string) => void;
  onDueDateChange: (v: string) => void;
  onCharge: (checkout: Checkout) => void;
}

export function PaymentPanel({
  payment, cashGiven, subtotal, discount, discountBreakdown, tax, total, cartCount, hasCustomer, customerName, customerId, customers = [], onCustomerChange, dueDate, vatEnabled, vatRate, vatMode = "inclusive", vatBreakdown, currencySymbol, fmt,
  saving, pricingPending, checkoutBlocked, blockedReason, onRetryPricing, approvalPending, saleError, itemsCashReceivedSum, notes, onNotesChange, onPaymentChange, onCashChange, onDueDateChange, onCharge,
}: PaymentPanelProps) {
  const can = useCan();
  const canCredit = can("credit", "create");
  // The arrangement is the cashier's explicit choice. Typing less than the total never turns a sale into debt by itself.
  // Two separate choices: HOW MUCH is settled now (the arrangement) and WHAT it is paid with (the method).
  const [arr, setArr] = useState<"full" | "partial" | "credit">("full");
  const [method, setMethod] = useState<"cash" | "mobile" | "card" | "split">(payment === "bank" ? "cash" : payment);
  const tab: Tab = arr === "credit" ? "credit" : method;
  const [reference, setReference] = useState("");
  const [splits, setSplits] = useState<SplitEntry[]>([]);
  const [dialog, setDialog] = useState<"split" | null>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  // A finished or cleared sale starts the next one clean (adjusted during render, so there is no stale flash).
  const [seenCount, setSeenCount] = useState(cartCount);
  if (seenCount !== cartCount) {
    setSeenCount(cartCount);
    if (cartCount === 0) { setArr("full"); setMethod("cash"); setReference(""); setSplits([]); setDialog(null); }
  }

  const single = tab !== "split" && tab !== "credit";
  const entered = Number(cashGiven || 0);
  // ── what is being paid now ──
  const splitPayments = splits.map((s) => ({ method: s.method, amount: Math.max(0, Number(s.amount || 0)), reference: s.reference.trim() })).filter((s) => s.amount > 0);
  // An empty amount means "the full total" for a normal sale, and "nothing typed yet" for a partial payment.
  const paid = tab === "credit" ? 0 : tab === "split" ? splitPayments.reduce((n, s) => n + s.amount, 0) : cashGiven === "" ? (arr === "partial" ? 0 : total) : Math.min(Math.max(0, entered), total);
  const change = tab === "cash" && cashGiven !== "" ? Math.max(0, entered - total) : 0;
  const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
  const over = tab === "split" && paid > total + 0.005;
  // Cash can be more than the total (the extra is change). Mobile money and card are exact amounts: more than the sale is a mistake, not change.
  const overNonCash = single && tab !== "cash" && cashGiven !== "" && entered > total + 0.005;
  const debt = remaining > 0;
  const debtAccepted = arr !== "full"; // choosing Partial payment or On credit IS the explicit confirmation
  // Mobile money takes no reference; card and bank transfers keep theirs so they can be matched to the provider.
  const needsRef = (m: PaymentMethod) => m === "card" || m === "bank";
  const refMissing = (single && needsRef(tab as PaymentMethod) && paid > 0 && !reference.trim()) || (tab === "split" && splitPayments.some((s) => needsRef(s.method) && !s.reference));
  const missingDebtFields = debt && (!hasCustomer || !dueDate || !canCredit);
  const why = cartCount === 0 || saving ? null
    : checkoutBlocked && !pricingPending ? blockedReason ?? "Please wait while the price is confirmed."
    : debtAccepted && !canCredit ? "You don't have permission to sell on credit. Ask the owner, or take full payment."
    : debtAccepted && !hasCustomer ? "Choose who will owe the balance."
    : arr === "partial" && paid <= 0 ? "Enter how much they pay now."
    : arr === "partial" && !debt ? "That covers the whole sale. Choose Paid in full, or lower the amount."
    : over ? "The payments add up to more than the total."
    : overNonCash ? "Mobile money or card can't be more than the total."
    : refMissing ? "Enter the reference for the card or bank payment."
    : missingDebtFields ? "Choose when the balance is due."
    : debt && !debtAccepted ? "The amount is less than the total. Choose Partial payment or On credit, or take the full amount."
    : tab === "split" && splitPayments.length === 0 && !debt ? "Add the split payments."
    : null;
  const blocked = cartCount === 0 || saving || checkoutBlocked || pricingPending || over || overNonCash || refMissing || (debt && !debtAccepted) || (arr === "partial" && (!debt || paid <= 0)) || missingDebtFields || (tab === "split" && splitPayments.length === 0 && !debt) || (tab === "cash" && cashGiven !== "" && entered < 0);

  const snapshot = useCustomerDebtSnapshot(customerId ?? null, debt).data;
  const owedNow = snapshot?.summary.outstanding != null ? Number(snapshot.summary.outstanding) : null;
  const dailyLimit = snapshot?.customer?.credit_daily_limit != null ? Number(snapshot.customer.credit_daily_limit) : null;

  // An amount can never go past what is owed: it is held at the sale total, for every method.
  const limitSingle = (raw: string) => {
    const n = Number(raw);
    return raw !== "" && Number.isFinite(n) && n > total ? String(total) : raw;
  };
  const limitSplit = (id: number, raw: string) => {
    const others = splits.filter((x) => x.id !== id).reduce((n, x) => n + Math.max(0, Number(x.amount || 0)), 0);
    const room = Math.max(0, Math.round((total - others) * 100) / 100);
    return raw !== "" && Number(raw) > room ? String(room) : raw;
  };
  const startSplit = () => setSplits((all) => (all.length ? all : [{ id: nextId.current++, method: "cash", amount: "", reference: "" }, { id: nextId.current++, method: "mobile", amount: "", reference: "" }]));
  const defaultDue = () => { if (!dueDate) onDueDateChange(DUE_CHOICES[1].date()); };
  // Partial and credit open their details right here (who owes, how much now, when it's due): no dialog to fill and close.
  const chooseArr = (a: "full" | "partial" | "credit") => {
    setArr(a); setReference(""); setDialog(null);
    if (a === "full") { onCashChange(""); return; }
    defaultDue();
    if (a === "credit") { onCashChange("0"); return; }
    if (method === "split") { startSplit(); setDialog("split"); return; }
    onCashChange("");
    if (hasCustomer) setTimeout(() => amountInput.current?.focus(), 0);
  };
  const payOff = useDisabledPayMethods();
  const chooseMethod = (m: "cash" | "mobile" | "card" | "split") => {
    setMethod(m); setReference(""); setDialog(null);
    if (m === "split") { startSplit(); setDialog("split"); onCashChange(""); return; }
    onPaymentChange(m);
    if (arr === "full" || Number(cashGiven) >= total) onCashChange("");
  };
  const setSplit = (id: number, patch: Partial<SplitEntry>) => setSplits((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const label = arr === "credit" ? "Sell on credit" : arr === "partial" ? "Complete · pay now" : "Complete Sale";
  const amountShown = tab === "credit" ? remaining : paid;
  const money = (v: number) => `${currencySymbol} ${fmt(v)}`;

  const submit = () => {
    if (blocked) return;
    const payments = tab === "credit" ? [] : tab === "split" ? splitPayments.map((s) => ({ method: s.method, amount: s.amount, reference: s.reference || undefined }))
      : paid > 0 ? [{ method: tab as PaymentMethod, amount: paid, reference: reference.trim() || undefined, tendered: tab === "cash" && cashGiven !== "" ? entered : undefined }] : [];
    onCharge({ kind: tab === "credit" ? "credit" : tab === "split" ? "split" : "single", payments, paid, outstanding: remaining, dueDate: debt ? dueDate : null, change });
  };

  const dueLabel = dueDate ? new Date(`${dueDate}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null;

  const splitEditor = (
    <div className="space-y-2">
      {splits.map((s, i) => (
        <div key={s.id} className="space-y-1.5 rounded-lg border border-border p-2">
          <div className="flex items-center gap-1.5">
            <select aria-label={`Payment ${i + 1} method`} value={s.method} onChange={(e) => setSplit(s.id, { method: e.target.value as PaymentMethod })} className="rounded-lg border border-border bg-card px-2 py-2 text-[12px] font-semibold outline-none focus:border-accent">
              {METHODS.filter((m) => !payOff.has(m.id)).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <div className="relative min-w-0 flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] font-mono text-muted">{currencySymbol}</span>
              <input aria-label={`Payment ${i + 1} amount`} type="number" inputMode="decimal" min={0} max={Math.max(0, total - splits.filter((x) => x.id !== s.id).reduce((n, x) => n + Math.max(0, Number(x.amount || 0)), 0))} value={s.amount} onChange={(e) => setSplit(s.id, { amount: limitSplit(s.id, e.target.value) })} placeholder="0" className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-2 font-mono text-[13px] font-bold tabular-nums outline-none focus:border-accent" />
            </div>
            {remaining > 0 && Number(s.amount || 0) === 0 && <button type="button" onClick={() => setSplit(s.id, { amount: String(remaining) })} className="shrink-0 rounded-md border border-border px-2 py-1.5 text-[11px] font-semibold text-accent hover:bg-surface">Rest</button>}
            {splits.length > 1 && <button type="button" aria-label={`Remove payment ${i + 1}`} onClick={() => setSplits((all) => all.filter((x) => x.id !== s.id))} className="shrink-0 rounded-md p-2 text-muted hover:bg-surface hover:text-red-600"><Trash2 size={14} /></button>}
          </div>
          {needsRef(s.method) && <input aria-label={`Payment ${i + 1} reference`} value={s.reference} onChange={(e) => setSplit(s.id, { reference: e.target.value })} placeholder={s.method === "bank" ? "Bank transfer reference" : "Card approval number"} className={`w-full rounded-lg border bg-card px-2.5 py-1.5 text-[12px] outline-none ${Number(s.amount || 0) > 0 && !s.reference.trim() ? "border-red-300" : "border-border focus:border-accent"}`} />}
        </div>
      ))}
      {splits.length < 5 && <button type="button" onClick={() => setSplits((all) => [...all, { id: nextId.current++, method: "cash", amount: "", reference: "" }])} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-[12px] font-semibold text-accent hover:bg-surface"><Plus size={13} /> Add payment method</button>}
      <dl className="space-y-1 border-t border-border pt-2 text-[12px]">
        <div className="flex justify-between"><dt className="text-muted">Sale total</dt><dd className="font-mono tabular-nums">{currencySymbol} {fmt(total)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Payments entered</dt><dd className="font-mono tabular-nums">{currencySymbol} {fmt(paid)}</dd></div>
        <div className="flex justify-between font-bold"><dt>{over ? "Over by" : "Remaining"}</dt><dd className={`font-mono tabular-nums ${over ? "text-red-600" : remaining > 0 ? "text-amber-700 dark:text-amber-300" : "text-emerald-600 dark:text-emerald-400"}`}>{currencySymbol} {fmt(over ? paid - total : remaining)}</dd></div>
      </dl>
      {over && <p role="alert" className="text-[12px] font-semibold text-red-600">The payments add up to more than the sale. Reduce one of them.</p>}
    </div>
  );

  // Due date, what they'll owe and an optional note: shown inline under the amount for a partial or credit sale.
  const debtTerms = (
    <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-2.5">
      <div>
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-foreground"><Calendar size={12} className="text-accent" aria-hidden /> Pay by{dueLabel ? <span className="font-semibold normal-case tracking-normal text-muted">· {dueLabel}</span> : <span className="font-semibold normal-case tracking-normal text-red-600">· choose a date</span>}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {DUE_CHOICES.map((c) => { const d = c.date(); return <button key={c.label} type="button" aria-pressed={dueDate === d} onClick={() => onDueDateChange(d)} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${dueDate === d ? "border-accent bg-accent/10 text-accent" : "border-border bg-card text-muted hover:text-foreground"}`}>{c.label}</button>; })}
          <input type="date" aria-label="Pay by date" min={isoToday()} value={dueDate} onChange={(e) => onDueDateChange(e.target.value)} className={`min-w-[8.5rem] flex-1 rounded-lg border bg-card px-2 py-1 text-[12px] outline-none ${!dueDate ? "border-red-300" : "border-border focus:border-accent"}`} />
        </div>
      </div>
      <dl className="space-y-0.5 border-t border-amber-500/30 pt-2 text-[12.5px]">
        <div className="flex justify-between"><dt className="text-muted">Paid now</dt><dd className="font-mono tabular-nums">{money(paid)}</dd></div>
        <div className="flex justify-between font-bold text-amber-700 dark:text-amber-300"><dt>{customerName ? `${customerName} owes` : "Left to pay"}</dt><dd className="font-mono tabular-nums">{money(remaining)}</dd></div>
        {hasCustomer && owedNow !== null && owedNow > 0 && <div className="flex justify-between text-[11.5px] text-muted"><dt>Total debt after this sale</dt><dd className="font-mono tabular-nums">{money(owedNow + remaining)}</dd></div>}
        {hasCustomer && dailyLimit !== null && <p className="text-[11px] text-muted">Daily credit limit {money(dailyLimit)}. Above it, a manager approves the sale.</p>}
      </dl>
      {onNotesChange && <input value={notes ?? ""} onChange={(e) => onNotesChange(e.target.value)} aria-label="Note for this debt (optional)" placeholder="Note (optional), e.g. agreed with the owner" className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-[12px] outline-none focus:border-accent" />}
    </div>
  );

  return (
    <div className="flex flex-col gap-2 lg:gap-2.5">
      {/* Totals: one muted line of detail, then the total */}
      <div>
        <dl className="space-y-1 text-xs text-muted">
          <div className="flex justify-between gap-2"><dt>{discount > 0 ? "Subtotal before discounts" : "Subtotal"}{vatEnabled ? (vatMode === "exclusive" ? " (excl. VAT)" : " (incl. VAT)") : ""}</dt><dd className="tabular-nums">{currencySymbol} {fmt(subtotal)}</dd></div>
          {discountBreakdown && discount > 0 ? <>
            {discountBreakdown.product > 0 && <div className="flex justify-between"><dt>Product discounts</dt><dd>−{currencySymbol} {fmt(discountBreakdown.product)}</dd></div>}
            {discountBreakdown.order > 0 && <div className="flex justify-between"><dt>Sale discounts</dt><dd>−{currencySymbol} {fmt(discountBreakdown.order)}</dd></div>}
            {discountBreakdown.coupon > 0 && <div className="flex justify-between"><dt>Coupon discounts</dt><dd>−{currencySymbol} {fmt(discountBreakdown.coupon)}</dd></div>}
          </> : discount > 0 && <div className="flex justify-between"><dt>Discounts</dt><dd>−{currencySymbol} {fmt(discount)}</dd></div>}
          {discount > 0 && <div className="flex justify-between font-medium text-accent"><dt>Total savings</dt><dd>{currencySymbol} {fmt(discount)}</dd></div>}
          {vatEnabled && <div className="flex justify-between"><dt>{vatMode === "exclusive" ? "VAT" : "VAT included"}{vatRate ? ` (${Math.round(vatRate * 1000) / 10}%)` : ""}</dt><dd>{currencySymbol} {fmt(tax)}</dd></div>}
          {vatEnabled && (["zero_rated", "exempt", "out_of_scope"] as const).map(kind => vatBreakdown?.[kind] && <div key={kind} className="flex justify-between"><dt>{VAT_LABELS[kind]} sales</dt><dd className="tabular-nums">{currencySymbol} {fmt(Number(vatBreakdown[kind]!.gross))}</dd></div>)}
        </dl>
        <div className="mt-1 flex items-center justify-between rounded-xl bg-accent/10 px-3 py-1.5 lg:py-2">
          <span className="text-[12px] font-bold uppercase tracking-wider text-foreground">Total payable</span>
          <span className="font-mono text-[20px] lg:text-[24px] font-extrabold leading-tight tabular-nums tracking-tight text-accent">{currencySymbol} {fmt(total)}</span>
        </div>
      </div>

      {/* How much is paid now? (the arrangement) */}
      <div role="group" aria-label="Payment arrangement" className="grid grid-cols-3 gap-0.5 rounded-xl bg-surface p-0.5">
        {([["full", "Paid in full"], ["partial", "Partial payment"], ["credit", "On credit"]] as const).map(([k, l]) => {
          const locked = k !== "full" && !canCredit;
          return (
            <button key={k} type="button" aria-pressed={arr === k} disabled={locked} title={locked ? "You don't have permission to sell on credit" : undefined} onClick={() => chooseArr(k)}
              className={`h-8 lg:h-9 rounded-[10px] px-1 text-[12px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${arr === k ? (k === "full" ? "bg-card text-accent shadow-sm" : "bg-card text-amber-700 shadow-sm dark:text-amber-300") : "text-muted hover:text-foreground"}`}>{l}</button>
          );
        })}
      </div>
      {!canCredit && <p className="-mt-1 text-[11px] text-muted">Partial payment and credit sales are turned off for your account. Ask the owner to turn them on.</p>}

      {/* Partial or credit: first who owes the balance — picked or added right here */}
      {debtAccepted && canCredit && cartCount > 0 && (
        onCustomerChange
          ? <div><p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-foreground">Who owes the balance</p>
              <DebtCustomer customers={customers} customerId={customerId} customerName={customerName} owes={owedNow} money={money}
                onChange={(id, name) => { onCustomerChange(id, name); if (id && arr === "partial") setTimeout(() => amountInput.current?.focus(), 0); }} /></div>
          : !hasCustomer && <p role="alert" className="rounded-lg bg-red-500/10 px-2.5 py-2 text-[12px] font-semibold text-red-700 dark:text-red-400">Choose the customer who will owe the balance (Customer, above the cart).</p>
      )}

      {/* What is it paid with? (the method). Not needed when the whole sale is on credit. */}
      {arr !== "credit" && (
        <div role="group" aria-label="Payment method" className="grid grid-cols-4 gap-1">
          {([["cash", "Cash", Banknote], ["mobile", "Mobile", Smartphone], ["card", "Card", CreditCard], ["split", "Split", SplitSquareHorizontal]] as const).filter(([k]) => !payOff.has(k)).map(([k, l, Icon]) => (
            <button key={k} type="button" aria-pressed={method === k} onClick={() => chooseMethod(k)}
              className={`flex h-9 lg:h-10 items-center justify-center gap-1.5 rounded-xl border px-1 text-[11.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${method === k ? "border-accent bg-accent text-white shadow-sm" : "border-border bg-card text-foreground/75 hover:border-accent/50 hover:bg-surface"}`}>
              <Icon size={14} strokeWidth={2.2} aria-hidden /><span className="truncate">{l}</span>
            </button>
          ))}
        </div>
      )}

      {cartCount > 0 && (
        <div className="space-y-1.5">
          {/* Cash / Mobile Money / Card / Bank: only the fields that matter */}
          {single && (
            <>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <label htmlFor="pos-paid-now" className={arr === "partial" ? "w-full text-[11px] font-bold uppercase tracking-wide text-foreground" : "sr-only"}>{arr === "partial" ? "Paid now" : tab === "cash" ? "Amount received" : "Amount paid"}</label>
                <div className="relative min-w-[10rem] flex-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] font-mono text-muted">{currencySymbol}</span>
                  <input ref={amountInput} id="pos-paid-now" type="number" inputMode="decimal" min={0} max={total} value={cashGiven} onChange={(e) => onCashChange(limitSingle(e.target.value))} placeholder={arr === "partial" ? "How much do they pay now?" : `${tab === "cash" ? "Received" : "Paid"} ${fmt(total)}`}
                    className={`w-full rounded-xl border-2 bg-card py-1.5 lg:py-2.5 pl-10 pr-3 font-mono text-base font-bold tabular-nums outline-none transition-colors ${debt ? "border-amber-400 focus:border-amber-500" : "border-border focus:border-accent"}`} />
                </div>
                
                {tab === "cash" && cashGiven === "" && arr === "full" && <span className="shrink-0 text-[12px] font-semibold text-emerald-700 dark:text-emerald-400">Paid in full</span>}
              </div>
              {(tab === "cash" || arr === "partial") && (
                <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
                  {(arr === "partial" ? [25, 50, 75].map((pct) => [`${pct}%`, Math.floor(total * pct / 100)] as const) : tab === "cash" ? [["Full", total] as const] : []).filter(([, amt]) => amt > 0).map(([name, amt]) => <button key={name} type="button" aria-pressed={paid === amt && cashGiven !== ""} onClick={() => onCashChange(String(amt))} className={`shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors hover:border-accent/50 hover:text-accent ${paid === amt && cashGiven !== "" ? "border-accent bg-accent/10 text-accent" : "border-border bg-card text-foreground/70"}`}>{name} · {currencySymbol} {fmt(amt)}</button>)}
                  {!!itemsCashReceivedSum && itemsCashReceivedSum > 0 && String(itemsCashReceivedSum) !== cashGiven && <button type="button" onClick={() => onCashChange(String(itemsCashReceivedSum))} className="shrink-0 whitespace-nowrap px-1 text-[10.5px] font-semibold text-accent hover:underline">Itemized {currencySymbol} {fmt(itemsCashReceivedSum)}</button>}
                </div>
              )}
              {needsRef(tab as PaymentMethod) && (
                <input id="pos-ref" aria-label="Card approval number" value={reference} onChange={(e) => setReference(e.target.value)}
                  placeholder="Card approval number (required)"
                  className={`w-full rounded-lg border-2 bg-card px-3 py-2 text-[12.5px] outline-none ${refMissing ? "border-red-300 focus:border-red-400" : "border-border focus:border-accent"}`} />
              )}
            </>
          )}

          {overNonCash && (
            <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-[12px] font-semibold text-red-700 dark:text-red-400">{tab === "mobile" ? "Mobile money" : "Card"} must be the exact amount: {currencySymbol} {fmt(entered - total)} more than the sale total. Lower it to {currencySymbol} {fmt(total)}, or take the extra in Cash and give change.</p>
          )}
          {arr === "full" && debt && !over && (
            <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-[12px] font-semibold text-red-700 dark:text-red-400">{currencySymbol} {fmt(remaining)} is still unpaid. Take the full amount, or choose <strong>Partial payment</strong> to keep it as a debt.</p>
          )}
          {arr === "partial" && !debt && paid > 0 && (
            <p role="status" className="rounded-lg bg-surface px-2.5 py-2 text-[12px] font-medium text-muted">That covers the whole sale. Choose <strong>Paid in full</strong>, or lower the amount paid now.</p>
          )}

          {/* Split: summary here, the entries in a focused dialog */}
          {tab === "split" && (
            <button type="button" onClick={() => setDialog("split")} className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[12.5px] font-semibold focus-visible:outline-2 focus-visible:outline-accent ${over || refMissing ? "border-red-300 bg-red-500/5" : remaining > 0 ? "border-amber-400/60 bg-amber-500/5" : "border-accent/40 bg-accent/5"}`}>
              <span className="min-w-0 truncate">{splitPayments.length} payment{splitPayments.length === 1 ? "" : "s"} · {over ? "over by" : "remaining"} <span className="font-mono tabular-nums">{currencySymbol} {fmt(over ? paid - total : remaining)}</span></span>
              <span className="shrink-0 text-accent">Edit</span>
            </button>
          )}

          {/* Partial / credit: when it's due and what they'll owe, right here */}
          {debtAccepted && canCredit && remaining > 0 && !over && debtTerms}
        </div>
      )}

      {/* The error and the action stay pinned to the bottom of the scrolling checkout, so Charge is never scrolled out of reach. */}
      <div className="sticky -bottom-3 z-10 -mx-1 space-y-2 bg-card px-1 pb-3 pt-2">
      {saleError && (
        <div className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] font-medium text-red-600"><AlertCircle size={12} className="mt-0.5 flex-shrink-0" /><span>{saleError}</span></div>
      )}
      <Button disabled={blocked} onClick={submit} className="min-h-10 lg:min-h-12 w-full gap-2 rounded-xl text-[14px] lg:text-[15px] font-bold" aria-busy={saving || pricingPending} aria-describedby={blocked && why ? "pos-charge-why" : undefined}>
        {saving ? "Saving sale…" : pricingPending ? "Checking price…" : approvalPending ? "Approval required" : <>{label}{cartCount > 0 && <span className="font-mono tabular-nums">{currencySymbol} {fmt(amountShown)}</span>}</>}
      </Button>
      {blocked && why && (
        <p id="pos-charge-why" role="status" className="flex items-start gap-1.5 text-[11.5px] font-medium text-amber-700 dark:text-amber-400">
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0" aria-hidden /><span className="min-w-0 flex-1">{why}</span>
          {checkoutBlocked && onRetryPricing && <button type="button" onClick={onRetryPricing} className="shrink-0 font-semibold text-accent hover:underline">Retry</button>}
        </p>
      )}
      </div>

      <Drawer open={dialog === "split"} onClose={() => setDialog(null)} side="center" size="md" title="Split payment">
        <div className="space-y-3 p-4">{splitEditor}<Button className="w-full" onClick={() => setDialog(null)}>Done</Button></div>
      </Drawer>
    </div>
  );
}
