// Pricing comes from the backend billing tables (GET /public/pricing), so the website always shows what a business is
// actually charged. Nothing here is hardcoded: if the API is unreachable the page says so instead of showing guesses.

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export interface PlanPrice {
  monthly: number; annual: number; seatMonthly: number; branchMonthly: number; includedUsers: number; maxUsers: number | null;
  includedBranches: number; maxBranches: number | null; maxProducts: number | null; maxStorageMb: number | null; trialDays: number; taxBps: number; billActiveUsers: boolean;
}
export interface PublicPlan { id: string; name: string; description: string; prices: Record<string, PlanPrice>; modules: { key: string; name: string }[] }
export interface PublicPricing { plans: PublicPlan[]; currencies: string[]; generatedAt: string }

/** Fetches live pricing (server-side, revalidated every two minutes). Returns null when it can't be loaded. */
export async function fetchPricing(): Promise<PublicPricing | null> {
  try {
    const res = await fetch(`${API_BASE}/public/pricing`, { next: { revalidate: 120 } });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: PublicPricing };
    return body.data && Array.isArray(body.data.plans) ? body.data : null;
  } catch {
    return null;
  }
}

const EXPONENT: Record<string, number> = { JPY: 0, UGX: 0, RWF: 0, XOF: 0, XAF: 0, KRW: 0, KWD: 3, BHD: 3 };
const exponent = (currency: string) => EXPONENT[currency.toUpperCase()] ?? 2;

/** Minor units → "RWF 15,000" / "$30" / "$29.99". */
export function formatPrice(minor: number, currency: string): string {
  const e = exponent(currency);
  const major = minor / 10 ** e;
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: Number.isInteger(major) ? 0 : e, maximumFractionDigits: e }).format(major);
  } catch {
    return `${currency} ${major.toLocaleString("en")}`;
  }
}

export const REGION_LABEL: Record<string, string> = { RWF: "Rwanda (RWF)", USD: "International (USD)" };
export const regionLabel = (currency: string) => REGION_LABEL[currency] ?? currency;

/** Percentage saved by paying yearly, or 0 when there is no annual price or it isn't cheaper. */
export function annualSaving(p: PlanPrice): number {
  return p.annual > 0 && p.monthly > 0 ? Math.max(0, Math.round((1 - p.annual / (p.monthly * 12)) * 100)) : 0;
}

export const hasAnnual = (pricing: PublicPricing, currency: string) => pricing.plans.some((p) => (p.prices[currency]?.annual ?? 0) > 0);

const PLURALS: Record<string, string> = { branch: "branches" };
const plural = (n: number, word: string) => `${n.toLocaleString("en")} ${n === 1 ? word : PLURALS[word] ?? `${word}s`}`;

/** How many users or branches a plan allows, worded by what it really costs: extras that are free are just part of the limit. */
function allowance(included: number, max: number | null, extraMinor: number, word: string, currency: string): string {
  const many = PLURALS[word] ?? `${word}s`;
  const extra = extraMinor > 0 ? `, then ${formatPrice(extraMinor, currency)} per extra ${word} a month` : "";
  if (max === null) return extraMinor > 0 ? `${plural(included, word)} included${extra}` : `Unlimited ${many}`;
  if (max > included && extraMinor > 0) return `${plural(included, word)} included${extra}, up to ${max.toLocaleString("en")}`;
  return `Up to ${plural(max, word)}`;
}
const storage = (mb: number) => (mb >= 1024 ? `${+(mb / 1024).toFixed(1)} GB` : `${mb} MB`);

/** What a plan includes, straight from its entitlements. */
export function planFeatures(plan: PublicPlan, currency: string): string[] {
  const p = plan.prices[currency];
  if (!p) return [];
  const out: string[] = [];
  out.push(allowance(p.includedUsers, p.maxUsers || null, p.seatMonthly, "user", currency));
  out.push(allowance(p.includedBranches, p.maxBranches || null, p.branchMonthly, "branch", currency));
  if (p.maxProducts) out.push(`Up to ${plural(p.maxProducts, "product")}`);
  if (p.maxStorageMb) out.push(`${storage(p.maxStorageMb)} storage`);
  if (p.trialDays) out.push(`${p.trialDays}-day free trial`);
  for (const m of plan.modules) out.push(m.name);
  return out;
}
