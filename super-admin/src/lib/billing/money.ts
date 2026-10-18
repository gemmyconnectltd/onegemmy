// Decimal-safe billing math. Everything is integer minor units; the only rounding is explicit "round half up" on
// the result of an integer division. The frontend uses these for ESTIMATES and previews — the backend must
// recompute the authoritative amount when it charges (see BILLING_API.md).
import type { BillingCycle, Coupon, PriceSheet } from "./types";

/** Minor-unit exponent per currency (ISO 4217). Unlisted currencies default to 2. */
const EXPONENT: Record<string, number> = { JPY: 0, UGX: 0, RWF: 0, XOF: 0, XAF: 0, KRW: 0, KWD: 3, BHD: 3 };
export const exponentOf = (currency: string): number => EXPONENT[currency.toUpperCase()] ?? 2;

export const toMinor = (major: number | string, currency: string): number => {
  const e = exponentOf(currency);
  const s = typeof major === "number" ? major.toFixed(e) : major;
  const [w, f = ""] = s.trim().split(".");
  const frac = (f + "0".repeat(e)).slice(0, e);
  const n = parseInt((w || "0") + frac, 10);
  return Number.isNaN(n) ? 0 : n;
};
export const toMajorString = (minor: number, currency: string): string => {
  const e = exponentOf(currency);
  if (e === 0) return String(minor);
  const abs = Math.abs(minor).toString().padStart(e + 1, "0");
  return `${minor < 0 ? "-" : ""}${abs.slice(0, -e)}.${abs.slice(-e)}`;
};

export function formatMoney(minor: number, currency: string): string {
  const e = exponentOf(currency);
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: e, maximumFractionDigits: e }).format(Number(toMajorString(minor, currency)));
  } catch {
    return `${currency} ${toMajorString(minor, currency)}`;
  }
}

/** a × b ÷ c with round-half-up, integers only (all inputs ≥ 0). */
export const mulDiv = (a: number, b: number, c: number): number => (c === 0 ? 0 : Math.floor((a * b * 2 + c) / (c * 2)));

export interface CostInput {
  prices: PriceSheet;
  cycle: BillingCycle;
  includedUsers: number;
  includedBranches: number;
  users: number;
  branches: number;
}
export interface CostBreakdown {
  base: number;
  extraUsers: number;
  extraUsersAmount: number;
  extraBranches: number;
  extraBranchesAmount: number;
  total: number;
}

/**
 * Recurring charge for one billing period.
 *   total = base + extraUsers × extraUserPrice + extraBranches × extraBranchPrice
 * Extra-seat prices are monthly; an annual period charges 12 months of them. Example: Growth $39 incl. 3 users /
 * 1 branch, $7 per extra user, $10 per extra branch, 7 users + 3 branches → 39 + 4×7 + 2×10 = $87 / month.
 */
export function recurringCost(i: CostInput): CostBreakdown {
  const months = i.cycle === "annual" ? 12 : 1;
  const extraUsers = Math.max(0, Math.floor(i.users) - i.includedUsers);
  const extraBranches = Math.max(0, Math.floor(i.branches) - i.includedBranches);
  const base = i.cycle === "annual" ? i.prices.annualPrice : i.prices.monthlyPrice;
  const extraUsersAmount = extraUsers * i.prices.extraUserPrice * months;
  const extraBranchesAmount = extraBranches * i.prices.extraBranchPrice * months;
  return { base, extraUsers, extraUsersAmount, extraBranches, extraBranchesAmount, total: base + extraUsersAmount + extraBranchesAmount };
}

/** Discount a coupon gives on `amount`. Wrong currency or an inactive/expired coupon gives 0 (see validateCoupon). */
export function couponDiscount(c: Pick<Coupon, "kind" | "percentOffBps" | "amountOff" | "currency">, amount: number, currency: string): number {
  if (c.kind === "percent") return Math.min(amount, mulDiv(amount, c.percentOffBps, 10000));
  if (c.currency !== currency) return 0;
  return Math.min(amount, c.amountOff);
}

export const taxOn = (amount: number, rateBps: number): number => mulDiv(amount, rateBps, 10000);

/** Proration: charge/credit for `daysLeft` of a `periodDays` period when the recurring amount changes mid-cycle. */
export const prorate = (oldTotal: number, newTotal: number, daysLeft: number, periodDays: number): number => {
  const delta = newTotal - oldTotal;
  const sign = delta < 0 ? -1 : 1;
  return sign * mulDiv(Math.abs(delta), Math.max(0, Math.min(daysLeft, periodDays)), periodDays);
};

export function validateCoupon(c: Coupon, ctx: { planId: string; currency: string; now?: Date }): string | null {
  const now = ctx.now ?? new Date();
  if (!c.active) return "Coupon is inactive";
  if (c.startsAt && new Date(c.startsAt) > now) return "Coupon is not valid yet";
  if (c.expiresAt && new Date(c.expiresAt) < now) return "Coupon has expired";
  if (c.maxRedemptions !== null && c.redeemed >= c.maxRedemptions) return "Redemption limit reached";
  if (c.planIds.length && !c.planIds.includes(ctx.planId)) return "Coupon does not apply to this plan";
  if (c.kind === "fixed" && c.currency !== ctx.currency) return `Coupon is only valid for ${c.currency} subscriptions`;
  return null;
}

/** Monthly-equivalent revenue of a recurring amount, for MRR. */
export const monthlyEquivalent = (total: number, cycle: BillingCycle): number => (cycle === "annual" ? mulDiv(total, 1, 12) : total);
