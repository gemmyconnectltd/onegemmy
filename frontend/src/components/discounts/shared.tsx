"use client";

import Link from "next/link";
import { Menu } from "@base-ui/react/menu";
import { Archive, Copy, Eye, MoreHorizontal, Pause, Pencil, Play } from "lucide-react";
import type { DiscountRule } from "@/lib/api/discounts";

/** Plain-language names for the discount engine's rule types. */
export const TYPE_LABELS: Record<string, string> = {
  percentage: "Percentage", fixed: "Fixed amount", product: "Product discount", category: "Category discount",
  customer: "Customer / VIP", volume: "Volume", bogo: "Buy X get Y", coupon: "Coupon", order: "Order discount", tiered: "Tiered",
};
export const STATUS_OPTIONS = ["Draft", "Active", "Paused", "Archived"] as const;

/** Draft / Scheduled / Active / Paused / Expired / Archived, derived from the stored status and the validity window. */
export function displayStatus(rule: { status: string; starts_at?: string | null; ends_at?: string | null }): string {
  const now = Date.now();
  if (rule.status === "Active" && rule.ends_at && new Date(rule.ends_at).getTime() < now) return "Expired";
  if (rule.status === "Active" && rule.starts_at && new Date(rule.starts_at).getTime() > now) return "Scheduled";
  return rule.status;
}

const TONES: Record<string, string> = {
  Active: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400",
  Scheduled: "bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:text-sky-400",
  Paused: "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400",
  Draft: "bg-surface text-muted ring-border",
  Expired: "bg-surface text-muted ring-border",
  Archived: "bg-surface text-muted ring-border",
  Disabled: "bg-surface text-muted ring-border",
  Exhausted: "bg-surface text-muted ring-border",
};

export function OfferStatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${TONES[status] ?? TONES.Draft}`}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />{status}
  </span>;
}

/** "10%", "RWF 5,000", "Tiers 5+: 3% · 10+: 8%" or "Buy 2 get 1 at 100%". */
export function ruleValue(rule: DiscountRule, money: (n: number) => string): string {
  const config = rule.config ?? {};
  if (rule.type === "bogo") {
    const buy = (config.buy as { qty?: number } | undefined)?.qty;
    const get = config.get as { qty?: number; percent?: number } | undefined;
    return `Buy ${buy ?? "?"} get ${get?.qty ?? "?"} at ${get?.percent ?? 100}% off`;
  }
  const tiers = config.tiers as { from: number; value: number }[] | undefined;
  if ((rule.type === "tiered" || rule.type === "volume") && tiers?.length) return tiers.map((t) => `${t.from}+: ${t.value}%`).join(" · ");
  return rule.value_kind === "fixed" ? money(Number(rule.value)) : `${Number(rule.value)}%`;
}

type Scope = { product_ids?: string[]; category_ids?: string[]; customer_ids?: string[]; customer_types?: string[]; branch_ids?: string[]; channels?: string[] };
const scopeOf = (rule: DiscountRule): Scope => ((rule.config ?? {}) as { scope?: Scope }).scope ?? {};
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

export function appliesTo(rule: DiscountRule): string {
  const s = scopeOf(rule);
  const parts = [s.product_ids?.length ? count(s.product_ids.length, "product") : "", s.category_ids?.length ? count(s.category_ids.length, "category") : "",
    s.customer_ids?.length ? count(s.customer_ids.length, "customer") : "", s.customer_types?.length ? s.customer_types.join(", ") + " customers" : ""].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return rule.type === "order" ? "Whole sale" : "All products";
}

const CHANNELS: Record<string, string> = { pos: "POS", sales_order: "Sales", quotation: "Quotations" };
export function channelsOf(rule: DiscountRule): string {
  const list = scopeOf(rule).channels ?? [];
  return list.length ? list.map((c) => CHANNELS[c] ?? c).join(" + ") : "All channels";
}

const day = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null;
export function validity(rule: { starts_at?: string | null; ends_at?: string | null }): string {
  const from = day(rule.starts_at), to = day(rule.ends_at);
  if (from && to) return `${from} – ${to}`;
  if (to) return `Until ${to}`;
  if (from) return `From ${from}`;
  return "No end date";
}

const row = "flex min-h-10 w-full items-center gap-3 px-4 py-2 text-left text-sm outline-none data-highlighted:bg-surface data-highlighted:text-foreground";

/** View is the row's primary action; this menu holds the rest, showing only what the rule's status and the person allow. */
export function RuleActionsMenu({ rule, canEdit, canCreate, canActivate, onStatus }: {
  rule: DiscountRule; canEdit: boolean; canCreate: boolean; canActivate: boolean; onStatus: (status: string) => void;
}) {
  const archived = rule.status === "Archived";
  return <Menu.Root modal={false}>
    <Menu.Trigger aria-label={`More actions for ${rule.name}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-accent data-popup-open:border-accent data-popup-open:text-accent"><MoreHorizontal size={16} /></Menu.Trigger>
    <Menu.Portal><Menu.Positioner align="end" sideOffset={6} collisionPadding={12} className="z-50"><Menu.Popup className="w-52 rounded-xl border border-border bg-card py-1.5 text-foreground shadow-lg outline-none">
      <Menu.LinkItem render={<Link href={`/sales/discounts/rules/${rule.id}`} />} className={row}><Eye size={15} /> View details</Menu.LinkItem>
      {canEdit && !archived && <Menu.LinkItem render={<Link href={`/sales/discounts/new?edit=${rule.id}`} />} className={row}><Pencil size={15} /> Edit</Menu.LinkItem>}
      {canCreate && <Menu.LinkItem render={<Link href={`/sales/discounts/new?from=${rule.id}`} />} className={row}><Copy size={15} /> Duplicate</Menu.LinkItem>}
      {canActivate && !archived && <>
        <div className="my-1 border-t border-border" />
        {rule.status === "Active" ? <Menu.Item className={row} onClick={() => onStatus("Paused")}><Pause size={15} /> Pause</Menu.Item>
          : <Menu.Item className={`${row} text-accent`} onClick={() => onStatus("Active")}><Play size={15} /> Activate</Menu.Item>}
        <Menu.Item className={`${row} text-red-600 dark:text-red-400`} onClick={() => onStatus("Archived")}><Archive size={15} /> Archive</Menu.Item>
      </>}
    </Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}
