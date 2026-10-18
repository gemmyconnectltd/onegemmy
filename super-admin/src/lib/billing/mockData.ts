// Sample data for DEMO mode only. Names and prices here are illustrative — they are not Pesaa's real price list.
import { exponentOf, recurringCost, couponDiscount, taxOn } from "./money";
import type { BillingSettings, BillingState, Coupon, HistoryEvent, Invoice, Payment, Plan, PriceSheet, Subscription } from "./types";

const DAY = 86400000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();
const m = (major: number, cur: string) => Math.round(major * 10 ** exponentOf(cur));

export const DEFAULT_SETTINGS: BillingSettings = {
  defaultCurrency: "USD", supportedCurrencies: ["USD", "GHS", "KES"], taxRateBps: 0, taxLabel: "VAT", invoicePrefix: "INV",
  invoiceDueDays: 14, trialDefaultDays: 14, gracePeriodDays: 7, allowAnnual: true, proration: "create_prorations", autoCancelAfterDays: 30,
  extraUsersEnabled: true, extraUserLimit: 50, extraBranchesEnabled: true, extraBranchLimit: 20,
  notifyPaymentFailed: true, notifyInvoiceIssued: true, notifyTrialEnding: true, notifyCanceled: false, billingEmail: "billing@example.com",
};

const sheet = (cur: string, monthly: number, annual: number, user: number, branch: number, setup = 0): PriceSheet => ({
  version: 1, currency: cur, monthlyPrice: m(monthly, cur), annualPrice: m(annual, cur), extraUserPrice: m(user, cur), extraBranchPrice: m(branch, cur), setupFee: m(setup, cur), effectiveFrom: iso(-200),
});

function plans(): Plan[] {
  const base = { priceHistory: [] as PriceSheet[], createdAt: iso(-200), updatedAt: iso(-60) };
  return [
    { ...base, id: "plan_free", name: "Free", description: "Trial essentials for very small businesses", status: "active", prices: sheet("USD", 0, 0, 0, 0), includedUsers: 2, includedBranches: 1, modules: ["sales", "inventory"], limits: { maxProducts: 100, maxStorageMb: 200 }, supportLevel: "community", trialDays: 0 },
    { ...base, id: "plan_starter", name: "Starter", description: "Growing teams with the core modules", status: "active", prices: sheet("USD", 19, 190, 5, 8), includedUsers: 3, includedBranches: 1, modules: ["sales", "inventory", "procurement", "reports"], limits: { maxProducts: 2000, maxStorageMb: 2000 }, supportLevel: "email", trialDays: 14 },
    { ...base, id: "plan_professional", name: "Professional", description: "Full modules for scaling, multi-branch operations", status: "active", prices: sheet("USD", 39, 390, 7, 10), includedUsers: 3, includedBranches: 1, modules: ["sales", "inventory", "procurement", "accounting", "hr", "reports"], limits: { maxProducts: 20000, maxStorageMb: 10000 }, supportLevel: "priority", trialDays: 14 },
    { ...base, id: "plan_enterprise", name: "Enterprise", description: "Everything, with AI and a dedicated manager", status: "active", prices: sheet("USD", 149, 1490, 6, 8, 250), includedUsers: 15, includedBranches: 5, modules: ["sales", "inventory", "procurement", "accounting", "hr", "reports", "ai"], limits: { maxProducts: null, maxStorageMb: null }, supportLevel: "dedicated", trialDays: 30 },
    { ...base, id: "plan_legacy", name: "Legacy Basic", description: "Retired plan kept for existing subscribers", status: "archived", prices: sheet("USD", 15, 150, 4, 6), includedUsers: 2, includedBranches: 1, modules: ["sales", "inventory"], limits: { maxProducts: 500, maxStorageMb: 500 }, supportLevel: "email", trialDays: 0 },
  ];
}

const TENANTS: [string, string, string, string, string, number, number, "monthly" | "annual", Subscription["status"]][] = [
  // name, country, currency, planId, ..., users, branches, cycle, status
  ["Kwame Mart", "Ghana", "GHS", "plan_starter", "", 4, 1, "monthly", "active"],
  ["Accra Pharmacy Group", "Ghana", "GHS", "plan_professional", "", 7, 3, "monthly", "active"],
  ["Nairobi Fresh Foods", "Kenya", "KES", "plan_professional", "", 5, 2, "annual", "active"],
  ["Savannah Hardware", "Ghana", "USD", "plan_starter", "", 3, 1, "monthly", "past_due"],
  ["Lagos Textiles Ltd", "Nigeria", "USD", "plan_enterprise", "", 22, 6, "annual", "active"],
  ["Mombasa Cafe Co", "Kenya", "KES", "plan_starter", "", 3, 1, "monthly", "trialing"],
  ["Tema Logistics", "Ghana", "USD", "plan_professional", "", 3, 1, "monthly", "trialing"],
  ["Kumasi Auto Parts", "Ghana", "GHS", "plan_starter", "", 6, 2, "monthly", "past_due"],
  ["Kigali Print House", "Rwanda", "USD", "plan_starter", "", 2, 1, "annual", "canceled"],
  ["Cape Coast Traders", "Ghana", "GHS", "plan_free", "", 2, 1, "monthly", "active"],
  ["Eldoret Agro Supplies", "Kenya", "KES", "plan_professional", "", 9, 4, "monthly", "active"],
  ["Tamale Wholesale", "Ghana", "USD", "plan_legacy", "", 2, 1, "monthly", "active"],
  ["Abuja Electronics", "Nigeria", "USD", "plan_enterprise", "", 16, 5, "monthly", "active"],
  ["Takoradi Bakery", "Ghana", "GHS", "plan_starter", "", 3, 1, "monthly", "canceled"],
];

const FX: Record<string, number> = { USD: 1, GHS: 15, KES: 130 }; // demo conversion so local-currency subs have local prices

function localSheet(p: Plan, cur: string): PriceSheet {
  if (cur === p.prices.currency) return { ...p.prices };
  const f = FX[cur] ?? 1;
  const r = (v: number) => Math.round((v / 100) * f / 5) * 5 * 100; // round to a tidy local amount
  return { ...p.prices, currency: cur, monthlyPrice: r(p.prices.monthlyPrice), annualPrice: r(p.prices.annualPrice), extraUserPrice: r(p.prices.extraUserPrice), extraBranchPrice: r(p.prices.extraBranchPrice), setupFee: r(p.prices.setupFee) };
}

export function buildDemoState(): BillingState {
  const ps = plans();
  const coupons: Coupon[] = [
    { id: "cp_1", code: "WELCOME20", name: "Welcome offer", kind: "percent", percentOffBps: 2000, amountOff: 0, currency: null, planIds: [], startsAt: iso(-90), expiresAt: iso(120), maxRedemptions: 100, redeemed: 12, duration: "repeating", durationMonths: 3, active: true, createdAt: iso(-90) },
    { id: "cp_2", code: "ANNUAL10", name: "Annual switch", kind: "percent", percentOffBps: 1000, amountOff: 0, currency: null, planIds: ["plan_starter", "plan_professional"], startsAt: null, expiresAt: null, maxRedemptions: null, redeemed: 4, duration: "once", durationMonths: null, active: true, createdAt: iso(-60) },
    { id: "cp_3", code: "SAVE10USD", name: "$10 off", kind: "fixed", percentOffBps: 0, amountOff: 1000, currency: "USD", planIds: [], startsAt: iso(-30), expiresAt: iso(-2), maxRedemptions: 50, redeemed: 50, duration: "once", durationMonths: null, active: false, createdAt: iso(-45) },
  ];
  const subs: Subscription[] = [];
  const invoices: Invoice[] = [];
  const payments: Payment[] = [];
  let invN = 1000;
  let payN = 1;
  TENANTS.forEach(([name, country, cur, planId, , users, branches, cycle, status], idx) => {
    const plan = ps.find((p) => p.id === planId)!;
    const prices = localSheet(plan, cur);
    const cost = recurringCost({ prices, cycle, includedUsers: plan.includedUsers, includedBranches: plan.includedBranches, users, branches });
    const id = `sub_${idx + 1}`;
    const tenantId = `ten_${idx + 1}`;
    const coupon = idx === 0 ? coupons[0] : null;
    const started = -(40 + idx * 17);
    const periodDays = cycle === "annual" ? 365 : 30;
    const periodStart = status === "trialing" ? -4 : -((-started) % periodDays);
    const history: HistoryEvent[] = [{ id: `${id}_h1`, at: iso(started), actor: "System", action: "Subscription created", detail: `${plan.name} · ${cycle}` }];
    if (status === "past_due") history.push({ id: `${id}_h2`, at: iso(-6), actor: "System", action: "Payment failed", detail: "Card declined by issuer" });
    if (status === "canceled") history.push({ id: `${id}_h3`, at: iso(-12), actor: "Support", action: "Subscription canceled", detail: "Customer request" });
    subs.push({
      id, tenantId, tenantName: name, country, planId, cycle, status, currency: cur, priceSheet: prices,
      includedUsers: plan.includedUsers, includedBranches: plan.includedBranches, extraUsers: cost.extraUsers, extraBranches: cost.extraBranches, couponCode: coupon?.code ?? null,
      usage: { users, branches, products: 30 + idx * 41, storageMb: 40 + idx * 37 },
      currentPeriodStart: iso(periodStart), nextBillingDate: status === "canceled" ? null : status === "trialing" ? iso(10 - idx) : iso(periodStart + periodDays),
      trialEndsAt: status === "trialing" ? iso(10 - idx) : null, canceledAt: status === "canceled" ? iso(-12) : null, cancelAtPeriodEnd: false,
      paymentStatus: status === "past_due" ? "failed" : status === "trialing" || plan.prices.monthlyPrice === 0 ? "none" : "paid", history,
    });
    if (status === "trialing" || plan.prices.monthlyPrice === 0) return;
    // Two historical periods per paying subscription.
    for (let k = 2; k >= 1; k--) {
      const failed = status === "past_due" && k === 1;
      const gross = cost.total;
      const discount = coupon && k === 1 ? couponDiscount(coupon, gross, cur) : 0;
      const sub = gross - discount;
      const taxRate = DEFAULT_SETTINGS.taxRateBps;
      const tax = taxOn(sub, taxRate);
      const total = sub + tax;
      const issued = periodStart - (k - 1) * periodDays + 0;
      const invId = `inv_${invN}`;
      const paid = !failed && !(status === "canceled" && k === 1);
      invoices.push({
        id: invId, number: `INV-${String(invN++).padStart(6, "0")}`, tenantId, tenantName: name, subscriptionId: id, currency: cur,
        periodStart: iso(issued), periodEnd: iso(issued + periodDays), issuedAt: iso(issued), dueAt: iso(issued + 14),
        lines: [
          { id: `${invId}_l1`, description: `${plan.name} plan (${cycle})`, quantity: 1, unitAmount: cost.base, amount: cost.base },
          ...(cost.extraUsers ? [{ id: `${invId}_l2`, description: "Additional users", quantity: cost.extraUsers, unitAmount: cost.extraUsersAmount / cost.extraUsers, amount: cost.extraUsersAmount }] : []),
          ...(cost.extraBranches ? [{ id: `${invId}_l3`, description: "Additional branches", quantity: cost.extraBranches, unitAmount: cost.extraBranchesAmount / cost.extraBranches, amount: cost.extraBranchesAmount }] : []),
        ],
        subtotal: gross, discount, tax, taxRateBps: taxRate, total, paid: paid ? total : 0, status: paid ? "paid" : status === "canceled" ? "void" : "open", couponCode: discount ? coupon!.code : null,
      });
      const pStatus: Payment["status"] = failed ? "failed" : paid ? (idx === 4 && k === 1 ? "refunded" : "succeeded") : "failed";
      payments.push({
        id: `pay_${payN++}`, tenantId, tenantName: name, subscriptionId: id, invoiceId: invId, amount: total, refundedAmount: pStatus === "refunded" ? total : 0, currency: cur, status: pStatus,
        method: cur === "USD" ? "Card •••• 4242" : "Mobile money", provider: "Demo provider", providerRef: pStatus === "succeeded" || pStatus === "refunded" ? `demo_${1000 + payN * 7}` : null,
        failureReason: pStatus === "failed" ? "Card declined by issuer" : null, createdAt: iso(issued),
      });
    }
  });
  // A couple of in-flight payments so Pending/Processing states are visible.
  const s1 = subs[1];
  payments.push({ id: `pay_${payN++}`, tenantId: s1.tenantId, tenantName: s1.tenantName, subscriptionId: s1.id, invoiceId: null, amount: m(12, s1.currency), refundedAmount: 0, currency: s1.currency, status: "processing", method: "Mobile money", provider: "Demo provider", providerRef: null, failureReason: null, createdAt: iso(0) });
  const s2 = subs[2];
  payments.push({ id: `pay_${payN++}`, tenantId: s2.tenantId, tenantName: s2.tenantName, subscriptionId: s2.id, invoiceId: null, amount: m(500, s2.currency), refundedAmount: 0, currency: s2.currency, status: "pending", method: "Bank transfer", provider: "Demo provider", providerRef: null, failureReason: null, createdAt: iso(-1) });
  return { plans: ps, subscriptions: subs, payments, invoices, coupons, settings: { ...DEFAULT_SETTINGS } };
}
