"use client";
import { useState } from "react";
import { Building2, CheckCircle2, Loader2, PauseCircle, Plus, Trash2, Users, Warehouse } from "lucide-react";
import { useTenantLocations } from "@/lib/api/hooks";
import type { AdminTenant } from "@/lib/api/admin";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableScroll } from "@/components/ui/TableScroll";
import { thClass } from "@/components/ui/DataTable";
import { billingMoney } from "@/components/billing/BillingShared";
import { Card } from "@/app/(portal)/tenants/[id]/TenantPanels";
import { SubTabs } from "./BusinessShell";

function Stat({ icon: Icon, value, label }: { icon: typeof Building2; value: string; label: string }) {
  return <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"><span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><Icon size={16} aria-hidden /></span>
    <div className="min-w-0"><p className="truncate text-lg font-extrabold leading-tight">{value}</p><p className="truncate text-[11.5px] text-muted">{label}</p></div></div>;
}
const active = (s: string) => s.toLowerCase() === "active";

/** Branches and warehouses of one business, with real counts. Warehouses are read-only here: the business manages its own stock locations. */
export function LocationsPanel({ tenant, onAddBranch, onDeleteBranch, deletingId, bulk }: {
  tenant: AdminTenant; onAddBranch: () => void; onDeleteBranch: (id: string, name: string) => void; deletingId?: string | null; bulk?: { selected: Set<string>; toggle: (id: string) => void };
}) {
  const q = useTenantLocations(tenant.id);
  const [section, setSection] = useState<"branches" | "warehouses">("branches");
  if (q.isLoading) return <PageLoader variant="compact" />;
  if (q.error || !q.data) return <ErrorState message="Could not load the branches and warehouses of this business." onRetry={() => void q.refetch()} />;
  const { branches, warehouses } = q.data;
  const money = (n: number) => billingMoney(n, tenant.currency);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="pesaa-card-title text-lg">Locations Management</h2><p className="mt-0.5 text-[12.5px] text-muted">Branches, warehouses and the relationship between them.</p></div>
        <SubTabs label="Locations" active={section} onSelect={(k) => setSection(k as typeof section)} items={[{ key: "branches", label: "Branches", count: branches.length }, { key: "warehouses", label: "Warehouses", count: warehouses.length }]} />
      </div>
      {section === "branches" && (
        <Card title={`Branches (${branches.length})`} action={<Button size="sm" onClick={onAddBranch}><Plus size={13} /> Add branch</Button>}>
          <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={Building2} value={String(branches.length)} label="Total branches" /><Stat icon={CheckCircle2} value={String(branches.filter((b) => active(b.status)).length)} label="Active" />
            <Stat icon={PauseCircle} value={String(branches.filter((b) => !active(b.status)).length)} label="Inactive" /><Stat icon={Users} value={String(branches.reduce((n, b) => n + b.users, 0))} label="Users in branches" />
          </div>
          {branches.length === 0 ? <EmptyState icon={Building2} title="No branches yet" description="This business has not added a branch." action={<Button size="sm" onClick={onAddBranch}><Plus size={13} /> Add a branch</Button>} /> : (
            <div className="overflow-hidden rounded-lg border border-border"><TableScroll label="Branches"><table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="border-b border-border bg-surface/60"><tr>{bulk && <th className={thClass}><span className="sr-only">Select</span></th>}{["Branch", "Location", "Users", "Warehouses", "Status", "Actions"].map((h) => <th key={h} scope="col" className={thClass}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">{branches.map((b) => (
                <tr key={b.id} className="hover:bg-surface/50">
                  {bulk && <td className="px-4 py-2.5"><input type="checkbox" aria-label={`Select ${b.name}`} checked={bulk.selected.has(b.id)} onChange={() => bulk.toggle(b.id)} /></td>}
                  <td className="px-4 py-2.5 font-semibold">{b.name}</td><td className="px-4 py-2.5 text-muted">{b.location || "—"}</td><td className="px-4 py-2.5 tabular-nums">{b.users}</td><td className="px-4 py-2.5 tabular-nums">{b.warehouses}</td>
                  <td className="px-4 py-2.5"><Badge tone={active(b.status) ? "green" : "amber"} dot><span className="capitalize">{b.status}</span></Badge></td>
                  <td className="px-4 py-2.5"><Button variant="danger" size="sm" disabled={deletingId === b.id} onClick={() => onDeleteBranch(b.id, b.name)}>{deletingId === b.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete</Button></td>
                </tr>))}</tbody></table></TableScroll></div>)}
        </Card>
      )}
      {section === "warehouses" && (
        <Card title={`Warehouses (${warehouses.length})`}>
          <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={Warehouse} value={String(warehouses.length)} label="Total warehouses" /><Stat icon={CheckCircle2} value={String(warehouses.filter((w) => w.is_active).length)} label="Active" />
            <Stat icon={Building2} value={money(warehouses.reduce((n, w) => n + w.stock_value, 0))} label="Total stock value (at cost)" /><Stat icon={Users} value={warehouses.reduce((n, w) => n + w.products, 0).toLocaleString()} label="Product lines in stock" />
          </div>
          {warehouses.length === 0 ? <EmptyState icon={Warehouse} title="No warehouses yet" description="This business has not set up warehouses, so its stock is a single total." /> : (
            <div className="overflow-hidden rounded-lg border border-border"><TableScroll label="Warehouses"><table className="w-full min-w-[760px] text-left text-[13px]">
              <thead className="border-b border-border bg-surface/60"><tr>{["Warehouse", "Code", "Branch", "Stock value", "Products", "Units", "Status"].map((h) => <th key={h} scope="col" className={thClass}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">{warehouses.map((w) => (
                <tr key={w.id} className="hover:bg-surface/50"><td className="px-4 py-2.5 font-semibold">{w.name}{w.is_default && <span className="ml-1.5 text-[10.5px] font-semibold text-muted">Default</span>}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px]">{w.code}</td><td className="px-4 py-2.5">{w.branch_name ?? "—"}</td><td className="px-4 py-2.5 tabular-nums">{money(w.stock_value)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{w.products.toLocaleString()}</td><td className="px-4 py-2.5 tabular-nums">{w.units.toLocaleString()}</td>
                  <td className="px-4 py-2.5"><Badge tone={w.is_active ? "green" : "amber"} dot>{w.is_active ? "Active" : "Inactive"}</Badge></td></tr>))}</tbody></table></TableScroll></div>)}
          <p className="mt-2 text-[11.5px] text-muted">Stock comes from the business&apos;s stock ledger. Warehouses are managed by the business itself; capacity is not tracked.</p>
        </Card>
      )}
    </div>
  );
}
