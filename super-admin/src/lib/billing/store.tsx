"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { billingService } from "./service";
import { daysBetween, newId, pricesChanged, subscriptionCost } from "./logic";
import { formatMoney, prorate } from "./money";
import type { BillingSettings, BillingState, Coupon, HistoryEvent, Plan, Subscription } from "./types";

const ACTOR = "Super Admin";
type Status = "loading" | "ready" | "error";

interface Actions {
  savePlan: (plan: Plan, isNew: boolean) => void;
  setPlanStatus: (id: string, status: Plan["status"]) => void;
  duplicatePlan: (id: string) => string | null;
  changePlan: (subId: string, planId: string, cycle?: Subscription["cycle"]) => void;
  setCycle: (subId: string, cycle: Subscription["cycle"]) => void;
  setAllowances: (subId: string, extraUsers: number, extraBranches: number) => void;
  extendTrial: (subId: string, days: number) => void;
  cancelSubscription: (subId: string, atPeriodEnd: boolean) => void;
  reactivate: (subId: string) => void;
  saveCoupon: (c: Coupon) => void;
  setCouponActive: (id: string, active: boolean) => void;
  deleteCoupon: (id: string) => void;
  saveSettings: (s: BillingSettings) => void;
  resetDemo: () => Promise<void>;
  reload: () => void;
}
interface Ctx { state: BillingState | null; status: Status; actions: Actions }
const BillingContext = createContext<Ctx | null>(null);

const ev = (action: string, detail: string): HistoryEvent => ({ id: newId("h"), at: new Date().toISOString(), actor: ACTOR, action, detail });

export function BillingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BillingState | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const latest = useRef<BillingState | null>(null);
  const dirty = useRef(false);

  const fetchState = useCallback(() => {
    billingService.load().then((s) => { latest.current = s; setState(s); setStatus("ready"); }).catch(() => setStatus("error"));
  }, []);
  const load = useCallback(() => { setStatus("loading"); fetchState(); }, [fetchState]);
  useEffect(() => { fetchState(); }, [fetchState]);

  // Persist (debounced) and flush when the tab is hidden, so a quick reload never loses an edit.
  useEffect(() => {
    latest.current = state;
    if (!state || !dirty.current) return;
    const t = setTimeout(() => { billingService.save(state); dirty.current = false; }, 400);
    return () => clearTimeout(t);
  }, [state]);
  useEffect(() => {
    const flush = () => { if (dirty.current && latest.current) { billingService.save(latest.current); dirty.current = false; } };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => { window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", onHide); };
  }, []);

  const mutate = useCallback((fn: (s: BillingState) => BillingState) => {
    dirty.current = true;
    setState((s) => (s ? fn(s) : s));
  }, []);
  const patchSub = useCallback((id: string, fn: (s: Subscription, st: BillingState) => Subscription) => {
    mutate((st) => ({ ...st, subscriptions: st.subscriptions.map((s) => (s.id === id ? fn(s, st) : s)) }));
  }, [mutate]);

  const actions = useMemo<Actions>(() => ({
    savePlan: (plan, isNew) => mutate((st) => {
      const now = new Date().toISOString();
      if (isNew) return { ...st, plans: [{ ...plan, createdAt: now, updatedAt: now }, ...st.plans] };
      return {
        ...st,
        plans: st.plans.map((p) => {
          if (p.id !== plan.id) return p;
          // New price list => new version; the old one moves to history. Existing subscriptions keep their own copy.
          if (pricesChanged(p.prices, plan.prices)) {
            const next = { ...plan.prices, version: p.prices.version + 1, effectiveFrom: now };
            return { ...plan, prices: next, priceHistory: [p.prices, ...p.priceHistory], updatedAt: now };
          }
          return { ...plan, prices: p.prices, priceHistory: p.priceHistory, updatedAt: now };
        }),
      };
    }),
    setPlanStatus: (id, status) => mutate((st) => ({ ...st, plans: st.plans.map((p) => (p.id === id ? { ...p, status, updatedAt: new Date().toISOString() } : p)) })),
    duplicatePlan: (id) => {
      const src = latest.current?.plans.find((p) => p.id === id);
      if (!src) return null;
      const copy: Plan = { ...src, id: newId("plan"), name: `${src.name} (copy)`, status: "draft", priceHistory: [], prices: { ...src.prices, version: 1, effectiveFrom: new Date().toISOString() }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      mutate((st) => ({ ...st, plans: [copy, ...st.plans] }));
      return copy.id;
    },
    changePlan: (subId, planId, cycle) => patchSub(subId, (s, st) => {
      const plan = st.plans.find((p) => p.id === planId);
      if (!plan) return s;
      const oldName = st.plans.find((p) => p.id === s.planId)?.name ?? s.planId;
      const nextCycle = cycle ?? s.cycle;
      // A plan change adopts the target plan's CURRENT price list (in the plan's currency) and its allowances.
      const next: Subscription = { ...s, planId, cycle: nextCycle, priceSheet: plan.prices, currency: plan.prices.currency, includedUsers: plan.includedUsers, includedBranches: plan.includedBranches,
        extraUsers: Math.max(0, s.usage.users - plan.includedUsers), extraBranches: Math.max(0, s.usage.branches - plan.includedBranches) };
      const before = subscriptionCost(s).total;
      const after = subscriptionCost(next).total;
      const days = s.nextBillingDate ? Math.max(0, daysBetween(new Date(), s.nextBillingDate)) : 0;
      const pr = s.currency === next.currency && st.settings.proration === "create_prorations" ? prorate(before, after, days, Math.max(1, daysBetween(s.currentPeriodStart, s.nextBillingDate ?? new Date()))) : 0;
      return { ...next, history: [ev("Plan changed", `${oldName} → ${plan.name}${pr ? ` · proration estimate ${pr > 0 ? "+" : ""}${formatMoney(pr, next.currency)}` : ""}`), ...s.history] };
    }),
    setCycle: (subId, cycle) => patchSub(subId, (s) => ({ ...s, cycle, history: [ev("Billing cycle changed", `${s.cycle} → ${cycle}`), ...s.history] })),
    setAllowances: (subId, extraUsers, extraBranches) => patchSub(subId, (s) => ({ ...s, extraUsers, extraBranches, history: [ev("Allowances adjusted", `${extraUsers} extra users · ${extraBranches} extra branches`), ...s.history] })),
    extendTrial: (subId, days) => patchSub(subId, (s) => {
      const base = s.trialEndsAt ? new Date(s.trialEndsAt) : new Date();
      const end = new Date(Math.max(base.getTime(), Date.now()) + days * 86400000).toISOString();
      return { ...s, status: "trialing", trialEndsAt: end, nextBillingDate: end, history: [ev("Trial extended", `+${days} days`), ...s.history] };
    }),
    cancelSubscription: (subId, atPeriodEnd) => patchSub(subId, (s) => atPeriodEnd
      ? { ...s, cancelAtPeriodEnd: true, history: [ev("Cancellation scheduled", "Ends at period end"), ...s.history] }
      : { ...s, status: "canceled", canceledAt: new Date().toISOString(), nextBillingDate: null, cancelAtPeriodEnd: false, history: [ev("Subscription canceled", "Immediate"), ...s.history] }),
    reactivate: (subId) => patchSub(subId, (s) => s.status === "canceled"
      ? { ...s, status: "active", canceledAt: null, cancelAtPeriodEnd: false, currentPeriodStart: new Date().toISOString(), nextBillingDate: new Date(Date.now() + (s.cycle === "annual" ? 365 : 30) * 86400000).toISOString(), history: [ev("Subscription reactivated", "Billing resumes"), ...s.history] }
      : { ...s, cancelAtPeriodEnd: false, history: [ev("Cancellation withdrawn", ""), ...s.history] }),
    saveCoupon: (c) => mutate((st) => ({ ...st, coupons: st.coupons.some((x) => x.id === c.id) ? st.coupons.map((x) => (x.id === c.id ? c : x)) : [c, ...st.coupons] })),
    setCouponActive: (id, active) => mutate((st) => ({ ...st, coupons: st.coupons.map((c) => (c.id === id ? { ...c, active } : c)) })),
    deleteCoupon: (id) => mutate((st) => ({ ...st, coupons: st.coupons.filter((c) => c.id !== id) })),
    saveSettings: (settings) => mutate((st) => ({ ...st, settings })),
    resetDemo: async () => { const s = await billingService.reset(); dirty.current = false; latest.current = s; setState(s); setStatus("ready"); },
    reload: load,
  }), [mutate, patchSub, load]);

  const value = useMemo(() => ({ state, status, actions }), [state, status, actions]);
  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling(): Ctx {
  const ctx = useContext(BillingContext);
  if (!ctx) throw new Error("useBilling must be used inside <BillingProvider>");
  return ctx;
}
