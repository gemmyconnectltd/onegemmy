"use client";

import Link from "next/link";
import { useState, type ElementType } from "react";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Boxes, ChevronRight, CreditCard, GitBranch, History, LayoutGrid, MousePointerClick, ShieldCheck, SlidersHorizontal } from "lucide-react";
import type { FeatureItemNode, FeatureTreeModule } from "@/lib/api/admin";
import { useFeatureTree } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";
import { TabStrip } from "@/components/ui/TabStrip";

/** Product control: every switch over what businesses can use, in one place. Pages live under /features. */
export const PRODUCT_CONTROL_PAGES = [
  { href: "/features", label: "Modules", icon: LayoutGrid, exact: true },
  { href: "/features/parts", label: "Submodules & features", icon: GitBranch },
  { href: "/features/access", label: "Access by business", icon: ShieldCheck },
  { href: "/features/changes", label: "Change log", icon: History },
] as const;

const RELATED = [
  { href: "/plans", label: "Plans & entitlements", icon: CreditCard },
  { href: "/erp-traffic/modules", label: "Module traffic", icon: MousePointerClick },
] as const;

const countParts = (nodes: FeatureItemNode[]): number => nodes.reduce((n, c) => n + 1 + countParts(c.children), 0);
const offParts = (nodes: FeatureItemNode[]): number => nodes.reduce((n, c) => n + (c.is_active ? 0 : 1) + offParts(c.children), 0);
const restrictions = (nodes: FeatureItemNode[]): number => nodes.reduce((n, c) => n + c.restricted_tenants + restrictions(c.children), 0);

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}

function Row({ href, label, icon: Icon, active, count, external }: { href: string; label: string; icon: ElementType; active?: boolean; count?: number; external?: boolean }) {
  return <Link href={href} aria-current={active ? "page" : undefined} data-active={!!active}
    className="pesaa-nav-row flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] font-semibold transition-colors">
    <Icon size={16} aria-hidden className="flex-shrink-0" />
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {typeof count === "number" && <span data-nav-indicator className="rounded-md bg-surface px-1.5 py-0.5 text-[11px] tabular-nums">{count}</span>}
    {external && <ArrowUpRight size={13} aria-hidden className="flex-shrink-0" />}
  </Link>;
}

function Heading({ children }: { children: string }) {
  return <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{children}</p>;
}

function StatusDot({ on }: { on: boolean }) {
  return <span aria-hidden className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", on ? "bg-[var(--success)]" : "bg-muted")} />;
}

function ModuleBranch({ module, pathname }: { module: FeatureTreeModule; pathname: string }) {
  const href = `/features/${module.key}`;
  const active = pathname === href;
  const [open, setOpen] = useState(active);
  const parts = module.children;
  return <li>
    <div className="flex items-center">
      <button type="button" onClick={() => setOpen(!open)} disabled={!parts.length} aria-expanded={parts.length ? open : undefined}
        aria-label={parts.length ? `${open ? "Collapse" : "Expand"} ${module.name}` : undefined}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center text-muted hover:text-foreground disabled:opacity-0">
        <ChevronRight size={14} aria-hidden className={cn("transition-transform", open && "rotate-90")} />
      </button>
      <Link href={href} aria-current={active ? "page" : undefined} data-active={active}
        className="pesaa-nav-row flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-4 text-[13px] font-medium">
        <StatusDot on={module.is_active} />
        <span className="min-w-0 flex-1 truncate">{module.name}</span>
        {parts.length > 0 && <span data-nav-indicator className="text-[11px] tabular-nums">{countParts(parts)}</span>}
      </Link>
    </div>
    {open && parts.length > 0 && <ul className="mb-1 ml-8 border-l border-border">
      {parts.flatMap((p) => [p, ...p.children]).map((p) => <li key={p.key}>
        <Link href={`/features/${p.key}`} aria-current={pathname === `/features/${p.key}` ? "page" : undefined}
          className="flex items-center gap-2 py-1 pl-3 pr-4 text-[12.5px] text-muted hover:text-foreground">
          <StatusDot on={p.is_active} />
          <span className={cn("min-w-0 flex-1 truncate", p.level === "submodule" && "font-semibold text-foreground")}>{p.name}</span>
          {p.restricted_tenants > 0 && <span className="text-[11px] tabular-nums" title={`Restricted for ${p.restricted_tenants} business${p.restricted_tenants === 1 ? "" : "es"}`}>{p.restricted_tenants}</span>}
        </Link>
      </li>)}
    </ul>}
  </li>;
}

export function ProductControlNav() {
  const pathname = usePathname();
  const tree = useFeatureTree();
  const modules = tree.data ?? [];
  const parts = modules.flatMap((m) => m.children);
  const counts: Record<string, number | undefined> = tree.data ? { "/features": modules.length, "/features/parts": countParts(parts) } : {};
  const pageActive = (href: string, exact?: boolean) => isActive(pathname, href, exact);
  const onModulePage = /^\/features\/[a-z_]+(\.[a-z_.]+)?$/.test(pathname) && !PRODUCT_CONTROL_PAGES.some((p) => p.href === pathname);

  return <>
    <div className="lg:hidden">
      <TabStrip label="Product control" items={PRODUCT_CONTROL_PAGES.map((p) => ({ key: p.href, label: p.label, icon: p.icon, href: p.href, active: pageActive(p.href, "exact" in p && p.exact) }))} />
    </div>
    <nav aria-label="Product control" className="hidden w-60 flex-shrink-0 lg:block xl:w-64">
      <div className="sticky top-20 flex max-h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><SlidersHorizontal size={16} aria-hidden /></span>
            <div className="min-w-0"><p className="truncate text-[13.5px] font-bold text-foreground">Product control</p><p className="truncate text-[11px] text-muted">What every business can use</p></div>
          </div>
          {tree.data && <dl className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-surface px-2.5 py-2"><dt className="text-[11px] text-muted">Parts off</dt><dd className="text-[15px] font-bold tabular-nums">{offParts(parts) + modules.filter((m) => !m.is_active).length}</dd></div>
            <div className="rounded-lg bg-surface px-2.5 py-2"><dt className="text-[11px] text-muted">Restrictions</dt><dd className="text-[15px] font-bold tabular-nums">{restrictions(parts)}</dd></div>
          </dl>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          <Heading>Control</Heading>
          {PRODUCT_CONTROL_PAGES.map((p) => <Row key={p.href} href={p.href} label={p.label} icon={p.icon} count={counts[p.href]}
            active={!onModulePage && pageActive(p.href, "exact" in p && p.exact)} />)}
          {modules.length > 0 && <>
            <Heading>Modules</Heading>
            <ul>{modules.map((m) => <ModuleBranch key={m.key} module={m} pathname={pathname} />)}</ul>
          </>}
          {tree.isLoading && <p className="flex items-center gap-2 px-4 py-2 text-[12px] text-muted"><Boxes size={13} aria-hidden /> Loading modules…</p>}
          <Heading>Related</Heading>
          {RELATED.map((r) => <Row key={r.href} href={r.href} label={r.label} icon={r.icon} external />)}
        </div>
      </div>
    </nav>
  </>;
}
