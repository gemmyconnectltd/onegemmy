// Real, live platform numbers for public marketing pages (home, impact) —
// fetched server-side from the backend's unauthenticated /global/platform-stats
// endpoint, not hardcoded copy. Never expose anything per-tenant or revenue
// here; the backend endpoint already keeps this to safe aggregate counts.

export interface PlatformStats {
  businesses: number;
  orders_processed: number;
  products_managed: number;
  countries: number;
  modules: number;
  currencies: number;
}

// Used only if the backend is unreachable at build/request time, so a
// marketing page never breaks — these mirror the current real minimums
// (module/currency counts are fixed product facts either way).
const FALLBACK_STATS: PlatformStats = {
  businesses: 0,
  orders_processed: 0,
  products_managed: 0,
  countries: 0,
  modules: 8,
  currencies: 6,
};

// Today's counts include internal/test tenants and orders created while
// building the product, not real customers — showing those publicly as
// "businesses already using Pesaa" would be misleading. These stats only
// appear once the real counts clear a threshold comfortably above that
// internal noise, so the page never claims traction that isn't real yet.
// Bump these down (or remove the gating below) once there's genuine usage.
export const MIN_BUSINESSES_TO_SHOW = 50;
export const MIN_ORDERS_TO_SHOW = 200;

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export async function getPlatformStats(): Promise<PlatformStats> {
  try {
    const res = await fetch(`${API_BASE}/global/platform-stats`, {
      // Marketing copy doesn't need to be second-fresh — re-fetch at most
      // every 10 minutes so this never adds real latency to a page load.
      next: { revalidate: 600 },
    });
    if (!res.ok) return FALLBACK_STATS;
    const json = await res.json();
    return { ...FALLBACK_STATS, ...json.data };
  } catch {
    return FALLBACK_STATS;
  }
}
