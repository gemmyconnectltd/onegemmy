import { monthlyEquivalent, recurringCost, type CostBreakdown } from "./money";
import type { BillingCycle, Coupon, Plan, PriceSheet, Subscription } from "./types";

export const subscriptionCost = (s: Subscription): CostBreakdown =>
  recurringCost({ prices: s.priceSheet, cycle: s.cycle, includedUsers: s.includedUsers, includedBranches: s.includedBranches, users: s.includedUsers + s.extraUsers, branches: s.includedBranches + s.extraBranches });

/** MRR per currency (never summed across currencies). Only active and past-due subscriptions count. */
export function mrrByCurrency(subs: Subscription[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of subs) {
    if (s.status !== "active" && s.status !== "past_due") continue;
    out[s.currency] = (out[s.currency] ?? 0) + monthlyEquivalent(subscriptionCost(s).total, s.cycle);
  }
  return out;
}

export function subscriberCount(planId: string, subs: Subscription[]): number {
  return subs.filter((s) => s.planId === planId && s.status !== "canceled").length;
}

/** Fields whose change alters what a NEW subscriber pays. */
export const PRICE_FIELDS: (keyof PriceSheet)[] = ["currency", "monthlyPrice", "annualPrice", "extraUserPrice", "extraBranchPrice", "setupFee"];
export const pricesChanged = (a: PriceSheet, b: PriceSheet): boolean => PRICE_FIELDS.some((k) => a[k] !== b[k]);

export const PLAN_FEATURE_FIELDS = ["includedUsers", "includedBranches"] as const;

export const SUPPORT_LABEL: Record<Plan["supportLevel"], string> = { community: "Community", email: "Email", priority: "Priority", dedicated: "Dedicated manager" };
export const CYCLE_LABEL: Record<BillingCycle, string> = { monthly: "Monthly", annual: "Annual" };

export const newId = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
export const daysBetween = (a: string | Date, b: string | Date) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

/** Exclusive status used by both a coupon badge and its filter. Dates compare instants, not locale strings. */
export function couponStatus(coupon: Coupon, now = Date.now()): "Expired" | "Exhausted" | "Inactive" | "Active" {
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= now) return "Expired";
  if (coupon.maxRedemptions !== null && coupon.redeemed >= coupon.maxRedemptions) return "Exhausted";
  if (!coupon.active || (coupon.startsAt && new Date(coupon.startsAt).getTime() > now)) return "Inactive";
  return "Active";
}
