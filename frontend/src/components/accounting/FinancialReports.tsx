"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart3, Scale, Wallet, GitBranch, Columns3, Users, Truck, Boxes, ArrowLeft, FileText } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useAppConfig } from "@/lib/appConfig";
import { useGenerateFinancialReport, useFinancialReport, useFinancialPreferences, useFinancialPreferencesSave, useFinancialBillTerms } from "@/lib/api/hooks";
import type { ReportKind, FinancialRow } from "@/lib/api/financialWorkspace";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Drawer } from "@/components/ui/Drawer";
import { TableScroll } from "@/components/ui/TableScroll";
import { PageLoader } from "@/components/ui/PageLoader";
import { AccountPicker, BranchFilter, ExportMenu, FinancialError, FinancialHeader, FinancialPagination, ReconciliationStatus, SummaryCards, today, useFinancialMoney } from "./FinancialShared";
import { SourceDocumentDetail } from "./SourceDocumentDetail";
import { JournalDetail } from "./JournalDetail";

export const FINANCIAL_REPORTS: { kind: ReportKind; title: string; description: string; icon: typeof BarChart3 }[] = [
  { kind: "income-statement", title: "Income Statement / Profit & Loss", description: "Revenue, costs, expenses and net profit from posted journals.", icon: BarChart3 },
  { kind: "balance-sheet", title: "Balance Sheet", description: "Assets, liabilities and equity at a reporting date.", icon: Scale },
  { kind: "cash-flow", title: "Cash Flow Statement", description: "Operating, investing and financing cash movements.", icon: Wallet },
  { kind: "equity", title: "Statement of Changes in Equity", description: "Opening equity, profit, direct movements and closing equity.", icon: GitBranch },
  { kind: "trial-balance", title: "Trial Balance", description: "Account debits and credits through a reporting date.", icon: Columns3 },
  { kind: "receivables-aging", title: "Accounts Receivable Aging", description: "Customer invoice balances and days overdue.", icon: Users },
  { kind: "payables-aging", title: "Accounts Payable Aging", description: "Supplier bill balances and days overdue.", icon: Truck },
  { kind: "inventory", title: "Inventory / Stock Report", description: "Current recorded unit-cost valuation of products and variants.", icon: Boxes },
];

export function ReportPreview({ kind, cashOnly = false }: { kind: ReportKind; cashOnly?: boolean }) {
  const { activeBranchId, hasPermission } = useAuth();
  const { currency } = useAppConfig();
  const generate = useGenerateFinancialReport();
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ from: "", to: today(), asOf: today(), account: "", search: "" });
  const report = useFinancialReport(snapshot, page);
  const [journalId, setJournalId] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [terms, setTerms] = useState<FinancialRow | null>(null);
  const [due, setDue] = useState("");
  const updateTerms = useFinancialBillTerms();
  const data = snapshot ? report.data : undefined;
  const fmt = useFinancialMoney(data?.currency);
  const period = ["income-statement", "cash-flow", "equity", "general-ledger"].includes(kind);
  const run = () => generate.mutate({ kind, from_date: period ? filters.from || undefined : undefined, to_date: period ? filters.to : undefined, as_of: !period ? filters.asOf : undefined, branch_id: activeBranchId || undefined, account_id: filters.account || undefined, search: filters.search || undefined, cash_only: cashOnly }, { onSuccess: r => { setSnapshot(r.data.id); setPage(1); } });
  return <div className="space-y-4">
    <form className="grid items-end gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-5" onSubmit={e => { e.preventDefault(); run(); }}>
      {period ? <><Field label="From (blank = fiscal year start)"><Input aria-label="Report from" type="date" max={filters.to} value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} /></Field><Field label="To"><Input aria-label="Report to" required type="date" min={filters.from || undefined} value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} /></Field></> : <Field label={kind === "inventory" ? "Current valuation date" : "As of"}><Input aria-label="Report as of" required type="date" value={filters.asOf} onChange={e => setFilters(f => ({ ...f, asOf: e.target.value }))} /></Field>}
      <Field label="Business / branch"><BranchFilter /></Field><Field label="Ledger currency"><Input aria-label="Report currency" readOnly value={currency} /></Field><Button type="submit" disabled={generate.isPending}>{generate.isPending ? "Generating…" : "Generate"}</Button>
      {kind === "general-ledger" && <><Field label="Account" className="sm:col-span-2"><AccountPicker cashOnly={cashOnly} label="Ledger account" value={filters.account} onChange={account => setFilters(f => ({ ...f, account }))} /></Field><Field label="Search references / descriptions" className="sm:col-span-2"><Input aria-label="Search ledger" value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} placeholder="Reference, description or account" /></Field></>}
    </form>
    <FinancialError error={generate.error || report.error || updateTerms.error} />
    {generate.isPending || (snapshot && report.isFetching) ? <PageLoader variant="compact" /> : !data ? <div className="rounded-xl border border-dashed border-border bg-card px-5 py-10 text-center"><FileText size={24} className="mx-auto mb-2 text-accent" /><p className="text-sm font-semibold">Choose your filters and generate the report.</p><p className="mt-1 text-xs text-muted">Preview and exports share one saved result. No journal is created by reporting.</p></div> : <>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-bold">{data.business}</h2><p className="mt-1 text-xs text-muted">{data.title} · {data.branch} · {data.currency}</p><p className="mt-1 text-xs text-muted">{period ? `${data.from_date} to ${data.to_date}` : `As of ${data.as_of}`} · Generated {new Date(data.generated_at).toLocaleString()}</p></div><ExportMenu snapshotId={data.id} /></div>
      <SummaryCards values={data.totals} currency={data.currency} /><ReconciliationStatus value={data.reconciliation} currency={data.currency} />
      <div className="overflow-hidden rounded-xl border border-border bg-card"><TableScroll><table className="w-full min-w-[700px] text-left text-[13px]"><thead><tr className="border-b border-border bg-surface/50">{data.columns.map(c => <th key={c.key} scope="col" className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted ${c.kind === "money" || c.kind === "number" ? "text-right" : ""}`}>{c.label}</th>)}{kind === "payables-aging" && hasPermission("accounts_payable:update") && <th className="px-4 py-3">Terms</th>}</tr></thead><tbody className="divide-y divide-border">{data.rows.map((row, index) => <tr key={String(row.id ?? `${page}-${index}`)} className="hover:bg-surface/40">{data.columns.map(c => <td key={c.key} className={`px-4 py-3 ${c.kind === "money" || c.kind === "number" ? "text-right tabular-nums" : ""}`}>{c.key === "reference" && kind === "general-ledger" ? <button className="font-semibold text-accent hover:underline" onClick={() => setJournalId(String(row.transaction_id))}>{String(row.reference)}</button> : c.key === "reference" && (kind === "receivables-aging" || kind === "payables-aging") ? <button type="button" onClick={() => setSource(String(row.id))} className="font-semibold text-accent hover:underline">{String(row.reference)}</button> : c.kind === "money" ? fmt(row[c.key] == null ? 0 : String(row[c.key])) : row[c.key] == null ? "—" : String(row[c.key])}</td>)}{kind === "payables-aging" && hasPermission("accounts_payable:update") && <td className="px-4 py-3"><Button variant="ghost" onClick={() => { setTerms(row); setDue(String(row.due_date ?? "")); }}>Set due date</Button></td>}</tr>)}{data.rows.length === 0 && <tr><td colSpan={data.columns.length + 1} className="px-4 py-10 text-center text-muted">No records match this report.</td></tr>}</tbody></table></TableScroll></div>
      <FinancialPagination page={page} total={data.total} size={50} onPage={setPage} />
      {data.notes.map((note, i) => <p key={i} className="rounded-lg border border-border bg-surface/40 px-3 py-2 text-xs leading-relaxed text-muted">{note}</p>)}
    </>}
    {source && <SourceDocumentDetail key={source} id={source} payable={kind === "payables-aging"} onClose={() => setSource(null)} />}
    <JournalDetail id={journalId} onClose={() => setJournalId(null)} />
    {terms && <Drawer open title="Supplier bill due date" onClose={() => setTerms(null)}><form className="space-y-4 p-5" onSubmit={e => { e.preventDefault(); updateTerms.mutate({ id: String(terms.id), dueDate: due || null }, { onSuccess: () => { setTerms(null); setSnapshot(null); } }); }}><p className="text-sm">{String(terms.reference)} · {String(terms.name)}</p><Field label="Due date"><Input type="date" value={due} onChange={e => setDue(e.target.value)} /></Field><p className="text-xs text-muted">The saved report remains unchanged. Generate a new report after updating terms.</p><FinancialError error={updateTerms.error} /><Button disabled={updateTerms.isPending}>Save due date</Button></form></Drawer>}
  </div>;
}

function FiscalPreferences() { const prefs = useFinancialPreferences(); const save = useFinancialPreferencesSave(); const { hasPermission } = useAuth(); const [month, setMonth] = useState<number | null>(null); if (!hasPermission("tenants:update")) return null; return <details className="rounded-xl border border-border bg-card p-4"><summary className="cursor-pointer text-xs font-semibold text-muted">Fiscal reporting preferences</summary><form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); save.mutate(month ?? prefs.data?.fiscal_start_month ?? 1); }}><Field label="Fiscal year starts in"><Select value={month ?? prefs.data?.fiscal_start_month ?? 1} onChange={e => setMonth(Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, i, 1)))}</option>)}</Select></Field><Button disabled={save.isPending}>Save preference</Button><p className="text-xs text-muted">Changes the default report period; historical journal balances stay unchanged.</p><FinancialError error={save.error} /></form></details>; }
export function FinancialReportsWorkspace() { const params = useSearchParams(); const router = useRouter(); const selected = FINANCIAL_REPORTS.find(r => r.kind === params.get("report")); return <div className="space-y-5"><FinancialHeader title={selected?.title ?? "Financial Reports"} description={selected ? "Posted accounting data and reconciled source balances, in one workspace." : "Eight financial reports. Select a report, choose the period and generate a preview."} actions={selected ? <Button variant="outline" onClick={() => router.push("/accounting/reports")}><ArrowLeft size={14} /> All reports</Button> : undefined} />{selected ? <ReportPreview key={selected.kind} kind={selected.kind} /> : <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{FINANCIAL_REPORTS.map(r => <Link key={r.kind} href={`/accounting/reports?report=${r.kind}`} className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent/40 hover:bg-accent/5"><span className="mb-3 inline-flex rounded-lg bg-accent/10 p-2 text-accent"><r.icon size={19} /></span><h2 className="text-sm font-bold group-hover:text-accent">{r.title}</h2><p className="mt-2 text-xs leading-relaxed text-muted">{r.description}</p></Link>)}</div><FiscalPreferences /></>}</div>; }
