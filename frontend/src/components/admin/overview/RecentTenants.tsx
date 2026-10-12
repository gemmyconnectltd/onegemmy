"use client";
import { TableScroll } from "@/components/ui/TableScroll";

import Link from "next/link";
import { ArrowRight, Eye } from "lucide-react";
import { useAnalyticsRecentTenants, type AnalyticsFilters, type RecentTenant } from "@/lib/api/hooks";
import { humanizeKey } from "@/lib/adminAnalytics";
import { QueryBody, SectionCard } from "./shared";
import { cn } from "@/lib/utils";

const STATUS: Record<RecentTenant["status"], { label: string; cls: string }> = {
  Active: { label: "Active", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  "Pending Approval": { label: "Pending", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  Suspended: { label: "Suspended", cls: "bg-red-500/10 text-red-700 dark:text-red-400" },
};

/** "Oct 7" — with the year only when it isn't the current one. */
function joined(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

const TH = "pb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted";

export function RecentTenants({ filters }: { filters: AnalyticsFilters }) {
  const q = useAnalyticsRecentTenants({ ...filters, limit: 5 });
  const rows = q.data ?? [];

  return (
    <SectionCard
      title="Recent Tenants"
      subtitle="Newest registrations"
      action={
        <Link href="/admin/tenants" className="flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline">
          View All <ArrowRight size={12} />
        </Link>
      }
    >
      <QueryBody query={q} errorMessage="Failed to load recent tenants." empty={rows.length === 0} emptyMessage="No tenants match these filters">
        <div className="-mx-1 overflow-x-auto px-1">
          <TableScroll><table className="w-full min-w-[440px] text-left">
            <thead>
              <tr className="border-b border-border">
                <th className={TH}>Business Name</th>
                <th className={TH}>Plan</th>
                <th className={TH}>Joined</th>
                <th className={TH}>Status</th>
                <th className={cn(TH, "text-right")}>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((t) => (
                <tr key={t.id} className="h-[46px] text-[13px]">
                  <td className="max-w-[11rem] truncate pr-3 text-[14px] font-semibold text-foreground">{t.name}</td>
                  <td className="pr-3">
                    {/* Neutral for the entry plan, tinted for any paid one — works for plans created later */}
                    <span className={cn(
                      "rounded-md px-2 py-0.5 text-[12px] font-medium",
                      t.plan === "free" ? "bg-surface text-muted" : "bg-accent/10 text-accent",
                    )}>
                      {humanizeKey(t.plan)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap pr-3 text-muted">{joined(t.createdAt)}</td>
                  <td className="pr-3">
                    <span className={cn("rounded-md px-2 py-0.5 text-[12px] font-semibold", STATUS[t.status].cls)}>{STATUS[t.status].label}</span>
                  </td>
                  <td className="text-right">
                    <Link href={`/admin/tenants/${t.id}`} aria-label={`View ${t.name}`} title="View tenant"
                      className="inline-flex rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-accent">
                      <Eye size={15} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></TableScroll>
        </div>
      </QueryBody>
    </SectionCard>
  );
}
