"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { AccessModule, PermissionGroup } from "@/lib/api/access";
import { STATUS_LABEL, moduleUse, type Tone } from "@/lib/accessView";

const TONE: Record<Tone, string> = {
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  slate: "bg-surface text-muted border border-border",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  red: "bg-red-500/10 text-red-700 dark:text-red-400",
};

export function Pill({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", TONE[tone])}>{children}</span>;
}

export const USER_TABS = [
  { label: "People", href: "/settings/users" },
] as const;

/** The tab strip shared by the People and Roles pages. Detail pages (one person, one role) show their own header instead. */
export function UsersTabs() {
  const pathname = usePathname();
  if (USER_TABS.length < 2 || !USER_TABS.some((t) => t.href === pathname)) return null;
  return (
    <nav aria-label="Users" className="no-scrollbar mb-5 flex overflow-x-auto border-b border-border">
      {USER_TABS.map((t) => {
        const on = t.href === pathname;
        return <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={cn("whitespace-nowrap border-b-2 px-3.5 py-3 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent", on ? "border-accent text-accent" : "border-transparent text-muted hover:border-border hover:text-foreground")}>{t.label}</Link>;
      })}
    </nav>
  );
}

export function ModuleUsePill({ module: m }: { module: AccessModule }) {
  const use = moduleUse(m);
  return <Pill tone={use.tone}>{use.label}</Pill>;
}

export function Back({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="mb-2 inline-block text-[12px] font-semibold text-muted hover:text-foreground">← {children}</Link>;
}

/** The permission matrix: one row per resource, one column per action the catalogue really has. Read-only unless `onToggle` is given. */
export function PermissionMatrix({ groups, onToggle, isOn }: { groups: PermissionGroup[]; onToggle?: (id: string, granted: boolean) => void; isOn?: (id: string, stored: boolean) => boolean }) {
  const actions = ["read", "create", "update", "delete", "approve"].filter((a) => groups.some((g) => g.resources.some((r) => r.actions[a])));
  const label = (a: string) => groups.flatMap((g) => g.resources).find((r) => r.actions[a])?.actions[a].label ?? a;
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.module} className="overflow-hidden rounded-xl border border-border bg-card">
          <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <h3 className="text-sm font-bold text-foreground">{g.name}</h3>
            {g.status && g.status !== "enabled" && <Pill tone={g.status === "available" ? "slate" : g.status === "restricted" ? "red" : "amber"}>{STATUS_LABEL[g.status]}</Pill>}
            {g.status && g.status !== "enabled" && <span className="text-[12px] text-muted">Permissions are kept but don&apos;t apply while the module is {g.status === "available" ? "turned off" : "unavailable"}.</span>}
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead><tr className="border-b border-border text-[12px] text-muted"><th scope="col" className="px-4 py-2 font-semibold">Area</th>{actions.map((a) => <th key={a} scope="col" className="px-3 py-2 text-center font-semibold">{label(a)}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">
                {g.resources.map((r) => (
                  <tr key={r.resource}>
                    <th scope="row" className="px-4 py-2 font-medium text-foreground">{r.label}</th>
                    {actions.map((a) => {
                      const cell = r.actions[a];
                      if (!cell) return <td key={a} className="px-3 py-2 text-center text-muted" aria-label="Not available">—</td>;
                      const on = isOn ? isOn(cell.id, cell.granted) : cell.granted;
                      return (
                        <td key={a} className="px-3 py-2 text-center">
                          {onToggle
                            ? <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={on} onChange={(e) => onToggle(cell.id, e.target.checked)} aria-label={`${cell.label} ${r.label}`} />
                            : <span aria-label={on ? "Allowed" : "Not allowed"} className={on ? "font-bold text-emerald-600" : "text-muted"}>{on ? "✓" : "—"}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
