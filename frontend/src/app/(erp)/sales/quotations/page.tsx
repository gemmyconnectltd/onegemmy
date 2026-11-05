"use client";
import { useDeferredValue, useState } from "react";
import { FilePlus2, Search } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";
import { useAuth } from "@/lib/auth";
import { fmtMoney } from "@/lib/config";
import type { ApiQuotation, QuotationStatus } from "@/lib/api";
import { useQuotations, useSalesTeam } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Form";
import { Pagination } from "@/components/ui/Pagination";
import { TableScroll } from "@/components/ui/TableScroll";
import { TableState } from "@/components/ui/TableState";
import { QuotationEditor } from "@/components/sales/QuotationEditor";
import { QuotationBadge, QuotationDetails } from "@/components/sales/QuotationDetails";

const STATUSES: ("All" | QuotationStatus)[] = ["All", "Draft", "Sent", "Accepted", "Rejected", "Expired"];

export default function QuotationsPage() {
  const { currencySymbol } = useAppConfig();
  const { hasPermission } = useAuth();
  const [status, setStatus] = useState<"All" | QuotationStatus>("All");
  const [search, setSearch] = useState("");
  const [seller, setSeller] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ApiQuotation | "new" | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const team = useSalesTeam();
  const q = useQuotations(page, { status: status === "All" ? undefined : status, search: useDeferredValue(search) || undefined, salesperson_id: seller || undefined });
  const items = q.data?.items ?? [];
  const filtered = status !== "All" || !!search || !!seller;
  const clear = () => { setStatus("All"); setSearch(""); setSeller(""); setPage(1); };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="pesaa-page-title">Quotations</h1><p className="text-sm text-muted">Offers to customers. They become a sale only when accepted and converted.</p></div>
        {hasPermission("orders:create") && <Button onClick={() => setEditing("new")}><FilePlus2 size={15} aria-hidden /> New quotation</Button>}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Status" className="flex flex-wrap gap-1">{STATUSES.map((s) => <button key={s} role="tab" aria-selected={status === s} onClick={() => { setStatus(s); setPage(1); }} className={`h-8 rounded-md px-3 text-xs font-medium ${status === s ? "bg-accent text-white" : "bg-surface text-muted hover:text-foreground"}`}>{s}</button>)}</div>
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden /><Input aria-label="Search quotations" className="pl-8" placeholder="Search by number" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
        {(team.data?.length ?? 0) > 1 && <Select aria-label="Salesperson" className="w-auto" value={seller} onChange={(e) => { setSeller(e.target.value); setPage(1); }}><option value="">All salespeople</option>{team.data!.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>}
      </div>

      {q.isLoading || q.error || items.length === 0 ? (
        <TableState loading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} empty={items.length === 0} filtered={filtered} onClearFilters={clear} title="No quotations yet" hint="Create one for a customer, then mark it as sent." />
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <TableScroll mobileLayout="cards" label="Quotations">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="px-4 py-2.5 font-medium">Number</th><th className="px-4 py-2.5 font-medium">Customer</th><th className="px-4 py-2.5 font-medium">Salesperson</th><th className="px-4 py-2.5 font-medium">Issued</th><th className="px-4 py-2.5 font-medium">Valid until</th><th className="px-4 py-2.5 text-right font-medium">Total</th><th className="px-4 py-2.5 font-medium">Status</th></tr></thead>
              <tbody className="divide-y divide-border">{items.map((x) => (
                <tr key={x.id} className="cursor-pointer hover:bg-surface/60" onClick={() => setViewing(x.id)}>
                  <td className="px-4 py-3 font-medium"><button className="text-accent hover:underline" onClick={(e) => { e.stopPropagation(); setViewing(x.id); }}>{x.quote_number}</button></td>
                  <td className="px-4 py-3">{x.customer?.name ?? <span className="text-muted">Walk-in</span>}</td>
                  <td className="px-4 py-3">{x.salesperson_name ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{x.issue_date}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{x.expiry_date ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{fmtMoney(x.total, currencySymbol)}</td>
                  <td className="px-4 py-3"><QuotationBadge status={x.status} /></td>
                </tr>))}</tbody>
            </table>
          </TableScroll>
          <Pagination page={page} pageSize={25} total={q.data?.total ?? 0} onPageChange={setPage} />
        </div>
      )}

      {editing && <QuotationEditor initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={(saved) => { setEditing(null); setViewing(saved.id); }} />}
      {viewing && !editing && <QuotationDetails id={viewing} onClose={() => setViewing(null)} onEdit={(x) => setEditing(x)} />}
    </div>
  );
}
