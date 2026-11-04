"use client";

import { useState } from "react";
import { Card } from "./TenantPanels";
import { useTenantRecords } from "@/lib/api/hooks";
import type { TenantRecordSection } from "@/lib/api/admin";
import { PageLoader } from "@/components/ui/PageLoader";
import { Pagination, SearchBox, thClass } from "@/components/ui/DataTable";
import { TableScroll } from "@/components/ui/TableScroll";
import { TabStrip } from "@/components/ui/TabStrip";
import { Input, Select } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { fmtDateTime } from "@/lib/date";

const SECTIONS: { key: TenantRecordSection; label: string }[] = [
  { key: "sales", label: "Sales" },
  { key: "customers", label: "Customers" },
  { key: "inventory", label: "Inventory" },
  { key: "purchases", label: "Purchases" },
  { key: "payments", label: "Payments" },
  { key: "debts", label: "Debts" },
  { key: "expenses", label: "Expenses" },
  { key: "accounting", label: "Accounting" },
  { key: "approvals", label: "Approvals" },
  { key: "activity", label: "Audit history" },
];

const PAGE_SIZE = 25;
const STATUS_OPTIONS: Partial<Record<TenantRecordSection, string[]>> = {
  sales: ["Completed", "Pending", "Draft", "Cancelled", "Awaiting Approval", "Returned"],
  customers: ["Active", "Inactive"],
  inventory: ["Active", "Inactive"],
  purchases: ["Draft", "Ordered", "Received", "Cancelled"],
  payments: ["Completed", "Reversed"],
  debts: ["Outstanding", "Unpaid", "PartiallyPaid", "Paid"],
  expenses: ["Pending", "Approved", "Rejected"],
  accounting: ["Draft", "Posted", "Void"],
  approvals: ["pending", "approved", "rejected", "cancelled", "Awaiting Approval"],
};

export function TenantRecords({ tenantId, currency, initialSection = "sales" }: { tenantId: string; currency: string; initialSection?: TenantRecordSection }) {
  const [section, setSection] = useState<TenantRecordSection>(initialSection);
  const [filters, setFilters] = useState({ q: "", status: "", date_from: "", date_to: "" });
  const [page, setPage] = useState(1);
  const validDateRange = !filters.date_from || !filters.date_to || filters.date_from <= filters.date_to;
  const result = useTenantRecords(tenantId, section, page, filters, { enabled: validDateRange });
  const items = result.data?.items ?? [];
  const hasFilters = Object.values(filters).some(Boolean);

  const changeSection = (next: TenantRecordSection) => {
    setSection(next);
    setPage(1);
    setFilters({ q: "", status: "", date_from: "", date_to: "" });
  };

  const updateFilter = (key: keyof typeof filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <TabStrip
        label="Business record categories"
        items={SECTIONS.map((item) => ({
          ...item,
          active: section === item.key,
          onSelect: () => changeSection(item.key),
        }))}
      />
      <Card title={`${SECTIONS.find((item) => item.key === section)?.label ?? "Business"} records`}>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <SearchBox
            value={filters.q}
            onChange={(value) => updateFilter("q", value)}
            placeholder="Search these records"
          />
          {STATUS_OPTIONS[section] && (
            <label className="grid gap-1 text-xs font-medium text-muted">
              Status
              <Select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)} aria-label="Filter by status" className="min-w-36">
                <option value="">All statuses</option>
                {STATUS_OPTIONS[section].map((status) => <option key={status} value={status}>{status}</option>)}
              </Select>
            </label>
          )}
          <label className="grid gap-1 text-xs font-medium text-muted">
            From
            <Input type="date" value={filters.date_from} max={filters.date_to || undefined} onChange={(event) => updateFilter("date_from", event.target.value)} aria-label="Start date" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted">
            To
            <Input type="date" value={filters.date_to} min={filters.date_from || undefined} onChange={(event) => updateFilter("date_to", event.target.value)} aria-label="End date" />
          </label>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setFilters({ q: "", status: "", date_from: "", date_to: "" }); setPage(1); }}>
              Clear filters
            </Button>
          )}
          {result.isFetching && !result.isLoading && <span className="text-xs text-muted">Updating…</span>}
        </div>
        {!validDateRange ? (
          <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600">
            Start date must be on or before end date.
          </p>
        ) : result.isLoading ? <PageLoader variant="compact" /> : result.isError ? (
          <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600">
            Could not load this business&apos;s records.
          </p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            {hasFilters ? "No records match these filters." : "No records have been recorded in this section."}
          </p>
        ) : (
          <>
            <TableScroll label="Business records">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-border bg-surface">
                  <tr>
                    <th scope="col" className={thClass}>RECORD</th>
                    <th scope="col" className={thClass}>STATUS / TYPE</th>
                    <th scope="col" className={thClass}>CUSTOMER / SUPPLIER / ACTOR</th>
                    <th scope="col" className={`${thClass} text-right`}>AMOUNT</th>
                    <th scope="col" className={thClass}>DATE</th>
                    <th scope="col" className={thClass}>DETAIL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((record) => {
                    const amount = record.amount === null ? null : Number(record.amount);
                    return (
                      <tr key={`${record.section}-${record.id}`} className="hover:bg-surface/50">
                        <td className="px-4 py-3">
                          <span className="block font-semibold text-foreground">{record.title || record.reference || "Record"}</span>
                          {record.reference && record.reference !== record.title && <span className="text-xs text-muted">{record.reference}</span>}
                        </td>
                        <td className="px-4 py-3 capitalize text-muted">
                          {["payments", "debts", "approvals"].includes(section) && record.section !== section
                            ? `${record.section} · ${record.status || ""}`
                            : record.status || record.section}
                        </td>
                        <td className="px-4 py-3 text-muted">{record.counterparty || "—"}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                          {amount === null || !Number.isFinite(amount) ? "—" : `${amount.toLocaleString()} ${record.currency || currency}`}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted">{fmtDateTime(record.recorded_at)}</td>
                        <td className="max-w-64 truncate px-4 py-3 text-muted" title={record.detail ?? undefined}>
                          {record.detail ? section === "inventory" ? `Stock: ${record.detail}` : record.detail : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
            <div className="mt-3">
              <Pagination page={page} pageSize={PAGE_SIZE} total={result.data?.total ?? 0} onPage={setPage} noun="record" />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
