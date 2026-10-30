import type { ModuleLink, ModuleStatus, TenantModule } from "./api/tenants";
import { PRIMARY_NAV_GROUPS, isPrimaryActive } from "./navigation";

export type ModuleFilter = "all" | "on" | "off" | "upgrade";

/** The menu entry a page belongs to (POS belongs to Sales), or null for pages with no entry such as the account menu. */
export function navItemForPath(path: string) {
  if (path === "/pos" || path.startsWith("/pos/")) return PRIMARY_NAV_GROUPS.flatMap((g) => g.items).find((i) => i.feature === "sales" && i.module === "sales") ?? null;
  return PRIMARY_NAV_GROUPS.flatMap((g) => g.items).find((i) => isPrimaryActive(path, i)) ?? null;
}

/** The module (feature key and display name) whose availability controls a page, or null for pages every business has. */
export function featureForPath(path: string): { key: string; name: string } | null {
  const item = navItemForPath(path);
  if (!item?.feature) return null;
  return { key: item.feature, name: path === "/pos" || path.startsWith("/pos/") ? "Sales & POS" : item.name };
}

/** What the signed-in person needs to open a page, read the way the menu reads it: a module they hold permissions in, and/or one
 *  named permission. Pages with no requirement (Overview, Reports, Business Settings, Support) return null. */
export function accessForPath(path: string): { name: string; module?: string; permission?: string; ownerOnly?: boolean } | null {
  const item = navItemForPath(path);
  if (!item) return null;
  const needed = item.module && item.access !== "" ? (item.access || item.module) : undefined;
  if (!needed && !item.permission && !item.ownerOnly) return null;
  return { name: item.name, module: needed, permission: item.permission, ...(item.ownerOnly ? { ownerOnly: true } : {}) };
}

/** Why a module can't be used, in words a business owner understands. */
export function unavailableReason(name: string, status: ModuleStatus | undefined): string {
  if (status === "available") return `${name} is turned off for your business.`;
  if (status === "restricted") return `${name} is paused for your business.`;
  return `${name} isn't part of your current plan.`;
}

export function matchesFilter(m: Pick<TenantModule, "status">, filter: ModuleFilter): boolean {
  return filter === "all" || (filter === "on" && m.status === "enabled") || (filter === "off" && m.status === "available") || (filter === "upgrade" && m.status === "not_included");
}

const names = (links: ModuleLink[]) => links.map((l) => l.name);

/** What must happen before this module can be switched: nothing, switch other modules on first, or switch dependants off first. */
export function switchBlockers(m: Pick<TenantModule, "status" | "needs" | "needed_by">): { turnOnFirst: string[]; turnOffFirst: string[] } {
  return {
    turnOnFirst: m.status === "available" ? names(m.needs.filter((n) => n.status !== "enabled")) : [],
    turnOffFirst: m.status === "enabled" ? names(m.needed_by.filter((n) => n.status === "enabled")) : [],
  };
}

/** Where a module lives in the app (the first menu entry it controls); appointments and the queue sit inside Services. */
export function moduleHref(key: string): string | null {
  const item = PRIMARY_NAV_GROUPS.flatMap((g) => g.items).find((i) => i.feature === key);
  if (item) return item.href;
  return key === "appointments" || key === "queue" ? "/services" : null;
}

/** How many modules are in each state, for the summary line. */
export function moduleCounts(modules: Pick<TenantModule, "status">[]): { included: number; on: number; off: number; upgrade: number; restricted: number } {
  const n = (s: ModuleStatus) => modules.filter((m) => m.status === s).length;
  return { included: modules.length - n("not_included"), on: n("enabled"), off: n("available"), upgrade: n("not_included"), restricted: n("restricted") };
}
