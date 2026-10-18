// The ONE place billing data comes from. Today: sample data persisted in this browser (demo only, no money moves).
// A later phase swaps these functions for calls to the Pesaa billing API described in BILLING_API.md.
import { buildDemoState } from "./mockData";
import type { BillingState } from "./types";

const KEY = "pesaa_admin_billing_demo_v1";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const billingService = {
  async load(): Promise<BillingState> {
    await wait(250);
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw) as BillingState;
        if (Array.isArray(p.plans) && Array.isArray(p.subscriptions) && p.settings) return p;
      }
    } catch { /* corrupted or blocked storage: fall back to sample data */ }
    return buildDemoState();
  },
  save(state: BillingState): void {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* demo just won't persist */ }
  },
  async reset(): Promise<BillingState> {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    await wait(150);
    return buildDemoState();
  },
};
