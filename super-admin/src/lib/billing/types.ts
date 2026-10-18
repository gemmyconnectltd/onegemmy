// Billing domain types. All money is an INTEGER in the currency's minor unit (cents/pesewas) — never a float.
// Every record carries its own currency; amounts in different currencies are never added together.

export type BillingCycle = "monthly" | "annual";
export type PlanStatus = "active" | "draft" | "archived";
export type SupportLevel = "community" | "email" | "priority" | "dedicated";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";
export type PaymentStatus = "pending" | "processing" | "succeeded" | "failed" | "refunded";
export type InvoiceStatus = "draft" | "open" | "paid" | "void" | "uncollectible";
export type CouponKind = "percent" | "fixed";
export type CouponDuration = "once" | "repeating" | "forever";

export interface PlanLimits { maxProducts: number | null; maxStorageMb: number | null }

/** One frozen price list. Subscriptions copy this at signup so later plan edits never change what they pay. */
export interface PriceSheet {
  version: number;
  currency: string;
  monthlyPrice: number;
  annualPrice: number;
  extraUserPrice: number; // per extra user, per month
  extraBranchPrice: number; // per extra branch, per month
  setupFee: number;
  effectiveFrom: string;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  status: PlanStatus;
  prices: PriceSheet; // current sheet; new subscribers get this
  priceHistory: PriceSheet[]; // previous sheets, newest first
  includedUsers: number;
  includedBranches: number;
  modules: string[]; // feature-flag keys (see backend FeatureFlag.key)
  limits: PlanLimits;
  supportLevel: SupportLevel;
  trialDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface UsageSnapshot { users: number; branches: number; products: number; storageMb: number }

export interface HistoryEvent { id: string; at: string; actor: string; action: string; detail: string }

export interface Subscription {
  id: string;
  tenantId: string;
  tenantName: string;
  country: string;
  planId: string;
  cycle: BillingCycle;
  status: SubscriptionStatus;
  currency: string;
  priceSheet: PriceSheet; // grandfathered prices this subscription actually pays
  includedUsers: number;
  includedBranches: number;
  extraUsers: number;
  extraBranches: number;
  couponCode: string | null;
  usage: UsageSnapshot;
  currentPeriodStart: string;
  nextBillingDate: string | null;
  trialEndsAt: string | null;
  canceledAt: string | null;
  cancelAtPeriodEnd: boolean;
  paymentStatus: "paid" | "unpaid" | "failed" | "none";
  history: HistoryEvent[];
}

export interface Payment {
  id: string;
  tenantId: string;
  tenantName: string;
  subscriptionId: string;
  invoiceId: string | null;
  amount: number;
  refundedAmount: number;
  currency: string;
  status: PaymentStatus;
  method: string; // e.g. "Card •••• 4242", "Mobile money" — display text only, no card data
  provider: string;
  providerRef: string | null; // reference reported by the provider; null until the provider confirms
  failureReason: string | null;
  createdAt: string;
}

export interface InvoiceLine { id: string; description: string; quantity: number; unitAmount: number; amount: number }

export interface Invoice {
  id: string;
  number: string;
  tenantId: string;
  tenantName: string;
  subscriptionId: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  issuedAt: string;
  dueAt: string;
  lines: InvoiceLine[]; // frozen at issue time
  subtotal: number;
  discount: number;
  tax: number;
  taxRateBps: number;
  total: number;
  paid: number;
  status: InvoiceStatus;
  couponCode: string | null;
}

export interface Coupon {
  id: string;
  code: string;
  name: string;
  kind: CouponKind;
  percentOffBps: number; // 1500 = 15.00 %
  amountOff: number; // minor units, fixed coupons only
  currency: string | null; // required for fixed coupons
  planIds: string[]; // empty = every plan
  startsAt: string | null;
  expiresAt: string | null;
  maxRedemptions: number | null;
  redeemed: number;
  duration: CouponDuration;
  durationMonths: number | null;
  active: boolean;
  createdAt: string;
}

export interface BillingSettings {
  defaultCurrency: string;
  supportedCurrencies: string[];
  taxRateBps: number;
  taxLabel: string;
  invoicePrefix: string;
  invoiceDueDays: number;
  trialDefaultDays: number;
  gracePeriodDays: number;
  allowAnnual: boolean;
  proration: "create_prorations" | "none";
  autoCancelAfterDays: number;
  extraUsersEnabled: boolean;
  extraUserLimit: number | null;
  extraBranchesEnabled: boolean;
  extraBranchLimit: number | null;
  notifyPaymentFailed: boolean;
  notifyInvoiceIssued: boolean;
  notifyTrialEnding: boolean;
  notifyCanceled: boolean;
  billingEmail: string;
}

export interface BillingState {
  plans: Plan[];
  subscriptions: Subscription[];
  payments: Payment[];
  invoices: Invoice[];
  coupons: Coupon[];
  settings: BillingSettings;
}
