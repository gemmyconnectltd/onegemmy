"use client";

import { useState } from "react";
import { Scale, BadgeCheck, AlertTriangle, RefreshCw } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { financeApi } from "@/lib/api/finance";
import { useIncomeStatement, useBalanceSheet, useCashFlow, useTrialBalance, useGeneralLedger } from "@/lib/api/hooks";
import { fmtMoney } from "@/lib/config";
import { useAppConfig } from "@/lib/appConfig";

type TabKey = "income" | "balance" | "cashflow" | "trial" | "ledger";

const TABS: { key: TabKey; label: string }[] = [
  { key: "income", label: "Income Statement" },
  { key: "balance", label: "Balance Sheet" },
  { key: "cashflow", label: "Cash Flow" },
  { key: "trial", label: "Trial Balance" },
  { key: "ledger", label: "General Ledger" },
];

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayISO = () => toISO(new Date());
const ytdStartISO = () => toISO(new Date(new Date().getFullYear(), 0, 1));

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return ok ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
      <BadgeCheck size={13} /> {children}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-500/10 text-red-500 dark:text-red-400">
      <AlertTriangle size={13} /> {children}
    </span>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </label>
  );
}

function KpiCard({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-1.5">
      <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">{label}</p>
      <p className="text-xl font-extrabold text-foreground" style={color ? { color } : undefined}>{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-muted py-12 text-center">{message}</p>;
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="bg-card border border-border rounded-xl py-12 px-6 text-center space-y-3">
      <AlertTriangle size={22} className="mx-auto text-red-500" />
      <p className="text-sm font-semibold text-foreground">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-border bg-surface text-sm font-semibold text-foreground hover:bg-surface/70"
        >
          <RefreshCw size={14} /> Retry
        </button>
      )}
    </div>
  );
}

function SectionTable({ title, lines, total }: { title: string; lines: { code: string; name: string; amount: number }[]; total: number }) {
  const { currencySymbol } = useAppConfig();
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        <span className="text-sm font-bold text-foreground">{fmtMoney(total, currencySymbol)}</span>
      </div>
      {lines.length === 0 ? (
        <EmptyState message="No accounts" />
      ) : (
        <table className="w-full">
          <tbody className="divide-y divide-border">
            {lines.map((l) => (
              <tr key={l.code} className="hover:bg-surface/50 transition-colors">
                <td className="p-4 text-xs text-muted w-20 font-mono">{l.code}</td>
                <td className="p-4 text-sm text-foreground">{l.name}</td>
                <td className="p-4 text-right text-sm font-medium text-foreground">{fmtMoney(l.amount, currencySymbol)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CardShell({
  from, setFrom, to, setTo, onLoad, onExport, children,
}: {
  from: string; setFrom: (v: string) => void;
  to: string; setTo: (v: string) => void;
  onLoad: () => void;
  onExport?: (format: "csv" | "pdf") => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap items-end gap-3 shadow-sm">
        <DateField label="From" value={from} onChange={setFrom} />
        <DateField label="To" value={to} onChange={setTo} />
        <button
          type="button"
          onClick={onLoad}
          className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90"
        >
          Load
        </button>
        <div className="flex-1" />
        {onExport && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onExport("csv")}
              className="h-9 px-3 rounded-lg border border-border bg-surface text-sm font-semibold text-foreground hover:bg-surface/70"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => onExport("pdf")}
              className="h-9 px-3 rounded-lg border border-border bg-surface text-sm font-semibold text-foreground hover:bg-surface/70"
            >
              Export PDF
            </button>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}


function IncomeCard() {
  const { currencySymbol } = useAppConfig();
  const [from, setFrom] = useState(ytdStartISO);
  const [to, setTo] = useState(todayISO);
  const { data, isLoading, isError, refetch } = useIncomeStatement(from, to);
  const loading = isLoading;
  const error = isError ? "Could not load the income statement." : null;

  return (
    <CardShell
      from={from} setFrom={setFrom} to={to} setTo={setTo}
      onLoad={() => refetch()}
      onExport={(fmt) => financeApi.exportStatement("income-statement", fmt, { fromDate: from, toDate: to })}
    >
      {loading ? (
        <PageLoader variant="compact" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => refetch()} />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <KpiCard label="Revenue" value={fmtMoney(data.total_revenue, currencySymbol)} />
            <KpiCard label="Cost of Goods" value={fmtMoney(data.total_cogs, currencySymbol)} />
            <KpiCard label="Gross Profit" value={fmtMoney(data.gross_profit, currencySymbol)} />
            <KpiCard label="Operating Expenses" value={fmtMoney(data.total_operating_expenses, currencySymbol)} />
            <KpiCard
              label="Net Income"
              value={fmtMoney(data.net_income, currencySymbol)}
              color={data.net_income >= 0 ? "var(--accent)" : "#ef4444"}
              hint={data.net_margin_pct != null ? `Margin ${data.net_margin_pct.toFixed(1)}%` : undefined}
            />
          </div>
          <SectionTable title="Revenue" lines={data.revenue_accounts} total={data.total_revenue} />
          <SectionTable title="Cost of Goods Sold" lines={data.cogs_accounts} total={data.total_cogs} />
          <SectionTable title="Operating Expenses" lines={data.operating_expense_accounts} total={data.total_operating_expenses} />
          <SectionTable title="Other Income" lines={data.other_income} total={data.total_other_income} />
        </>
      ) : (
        <EmptyState message="No income statement data yet" />
      )}
    </CardShell>
  );
}

function BalanceSheetCard() {
  const { currencySymbol } = useAppConfig();
  const [asOf, setAsOf] = useState(todayISO);
  const { data, isLoading, isError, refetch } = useBalanceSheet(asOf);
  const loading = isLoading;
  const error = isError ? "Could not load the balance sheet." : null;

  const exportBtn = (fmt: "csv" | "pdf") => (
    <button
      type="button"
      onClick={() => financeApi.exportStatement("balance-sheet", fmt, { asOf })}
      className="h-9 px-3 rounded-lg border border-border bg-surface text-sm font-semibold text-foreground hover:bg-surface/70"
    >
      Export {fmt.toUpperCase()}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap items-end gap-3 shadow-sm">
        <DateField label="As of" value={asOf} onChange={setAsOf} />
        <button
          type="button"
          onClick={() => refetch()}
          className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90"
        >
          Load
        </button>
        <div className="flex-1" />
        <div className="flex gap-2">{exportBtn("csv")}{exportBtn("pdf")}</div>
      </div>
      {loading ? (
        <PageLoader variant="compact" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => refetch()} />
      ) : data ? (
        <>
          <div className="flex items-center gap-3">
            <Badge ok={data.in_balance}>
              {data.in_balance ? "In balance" : `Out of balance (${fmtMoney(data.difference, currencySymbol)})`}
            </Badge>
            <span className="text-xs text-muted flex items-center gap-1"><Scale size={13} /> As of {data.as_of}</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Total Assets" value={fmtMoney(data.total_assets, currencySymbol)} />
            <KpiCard label="Total Liabilities" value={fmtMoney(data.total_liabilities, currencySymbol)} />
            <KpiCard label="Total Equity" value={fmtMoney(data.total_equity, currencySymbol)} />
            <KpiCard label="Retained Earnings" value={fmtMoney(data.retained_earnings, currencySymbol)} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionTable title="Current Assets" lines={data.current_assets.accounts} total={data.current_assets.total} />
            <SectionTable title="Non-Current Assets" lines={data.non_current_assets.accounts} total={data.non_current_assets.total} />
            <SectionTable title="Current Liabilities" lines={data.current_liabilities.accounts} total={data.current_liabilities.total} />
            <SectionTable title="Non-Current Liabilities" lines={data.non_current_liabilities.accounts} total={data.non_current_liabilities.total} />
          </div>
          <SectionTable title="Equity" lines={data.equity_accounts} total={data.total_equity} />
        </>
      ) : (
        <EmptyState message="No balance sheet data yet" />
      )}
    </div>
  );
}

function CashFlowCard() {
  const { currencySymbol } = useAppConfig();
  const [from, setFrom] = useState(ytdStartISO);
  const [to, setTo] = useState(todayISO);
  const { data, isLoading, isError, refetch } = useCashFlow(from, to);
  const loading = isLoading;
  const error = isError ? "Could not load the cash flow statement." : null;

  return (
    <CardShell
      from={from} setFrom={setFrom} to={to} setTo={setTo}
      onLoad={() => refetch()}
      onExport={(fmt) => financeApi.exportStatement("cash-flow", fmt, { fromDate: from, toDate: to })}
    >
      {loading ? (
        <PageLoader variant="compact" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => refetch()} />
      ) : data ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <KpiCard label="Net Change" value={fmtMoney(data.net_cash_change, currencySymbol)} />
            <KpiCard label="Beginning Cash" value={fmtMoney(data.beginning_cash, currencySymbol)} />
            <KpiCard label="Ending Cash" value={fmtMoney(data.ending_cash, currencySymbol)} />
          </div>
          {[
            { title: data.operating.title, section: data.operating },
            { title: data.investing.title, section: data.investing },
            { title: data.financing.title, section: data.financing },
          ].map(({ title, section }) => (
            <SectionTable
              key={title}
              title={title}
              lines={section.lines.map((l) => ({ code: l.account_code, name: l.account_name, amount: l.amount }))}
              total={section.total}
            />
          ))}
        </>
      ) : (
        <EmptyState message="No cash flow data yet" />
      )}
    </CardShell>
  );
}

function TrialBalanceCard() {
  const { currencySymbol } = useAppConfig();
  const [from, setFrom] = useState(ytdStartISO);
  const [to, setTo] = useState(todayISO);
  const { data, isLoading, isError, refetch } = useTrialBalance(from, to);
  const loading = isLoading;
  const error = isError ? "Could not load the trial balance." : null;

  return (
    <CardShell
      from={from} setFrom={setFrom} to={to} setTo={setTo}
      onLoad={() => refetch()}
      onExport={(fmt) => financeApi.exportStatement("trial-balance", fmt, { fromDate: from, toDate: to })}
    >
      {loading ? (
        <PageLoader variant="compact" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => refetch()} />
      ) : data ? (
        <>
          <div className="flex items-center gap-3">
            <Badge ok={data.balanced}>{data.balanced ? "Debits = Credits" : "Not balanced"}</Badge>
            <span className="text-xs text-muted">
              {data.total_debits.toLocaleString()} debit / {data.total_credits.toLocaleString()} credit
            </span>
          </div>
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="p-4 font-semibold">Code</th>
                  <th className="p-4 font-semibold">Account</th>
                  <th className="p-4 font-semibold text-right">Debits</th>
                  <th className="p-4 font-semibold text-right">Credits</th>
                  <th className="p-4 font-semibold text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.accounts.map((a) => (
                  <tr key={a.code} className="hover:bg-surface/50 transition-colors">
                    <td className="p-4 text-xs text-muted font-mono">{a.code}</td>
                    <td className="p-4 text-sm font-medium text-foreground">{a.name}</td>
                    <td className="p-4 text-right text-sm text-foreground">{fmtMoney(a.debit_total, currencySymbol)}</td>
                    <td className="p-4 text-right text-sm text-foreground">{fmtMoney(a.credit_total, currencySymbol)}</td>
                    <td className="p-4 text-right text-sm font-semibold text-foreground">{fmtMoney(a.balance, currencySymbol)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-surface">
                  <td className="p-4 text-sm font-bold text-foreground" colSpan={2}>Totals</td>
                  <td className="p-4 text-right text-sm font-bold text-foreground">{fmtMoney(data.total_debits, currencySymbol)}</td>
                  <td className="p-4 text-right text-sm font-bold text-foreground">{fmtMoney(data.total_credits, currencySymbol)}</td>
                  <td className="p-4 text-right text-sm font-bold text-foreground">{fmtMoney(data.total_debits - data.total_credits, currencySymbol)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : (
        <EmptyState message="No trial balance data yet" />
      )}
    </CardShell>
  );
}

function LedgerCard() {
  const { currencySymbol } = useAppConfig();
  const [from, setFrom] = useState(ytdStartISO);
  const [to, setTo] = useState(todayISO);
  const { data, isLoading, isError, refetch } = useGeneralLedger(from, to);
  const loading = isLoading;
  const error = isError ? "Could not load the general ledger." : null;

  return (
    <CardShell
      from={from} setFrom={setFrom} to={to} setTo={setTo}
      onLoad={() => refetch()}
      onExport={(fmt) => financeApi.exportStatement("general-ledger", fmt, { fromDate: from, toDate: to })}
    >
      {loading ? (
        <PageLoader variant="compact" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => refetch()} />
      ) : data ? (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          {data.entries.length === 0 ? (
            <EmptyState message="No entries in this period" />
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="p-4 font-semibold">Ref</th>
                  <th className="p-4 font-semibold">Date</th>
                  <th className="p-4 font-semibold">Description</th>
                  <th className="p-4 font-semibold">Type</th>
                  <th className="p-4 font-semibold text-right">Debit</th>
                  <th className="p-4 font-semibold text-right">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.entries.map((e) => (
                  <tr key={e.transaction_id} className="hover:bg-surface/50 transition-colors">
                    <td className="p-4 text-xs text-muted font-mono">{e.reference}</td>
                    <td className="p-4 text-sm text-muted">{e.date}</td>
                    <td className="p-4 text-sm font-medium text-foreground">{e.description ?? "—"}</td>
                    <td className="p-4 text-xs"><span className="px-2 py-0.5 rounded-full bg-surface border border-border text-muted capitalize">{e.type}</span></td>
                    <td className="p-4 text-right text-sm text-foreground">{e.debit ? fmtMoney(e.debit, currencySymbol) : "—"}</td>
                    <td className="p-4 text-right text-sm text-foreground">{e.credit ? fmtMoney(e.credit, currencySymbol) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-surface">
                  <td className="p-4 text-sm font-bold text-foreground" colSpan={4}>Totals</td>
                  <td className="p-4 text-right text-sm font-bold text-foreground">{fmtMoney(data.total_debits, currencySymbol)}</td>
                  <td className="p-4 text-right text-sm font-bold text-foreground">{fmtMoney(data.total_credits, currencySymbol)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      ) : (
        <EmptyState message="No ledger data yet" />
      )}
    </CardShell>
  );
}

export default function FinanceReportsPage() {
  const [tab, setTab] = useState<TabKey>("income");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Financial Statements</h1>
        <p className="text-sm text-muted mt-0.5">Income statement, balance sheet, cash flow and ledger</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t.key ? "text-white shadow-sm" : "text-foreground/60 hover:bg-surface hover:text-foreground"
            }`}
            style={tab === t.key ? { backgroundColor: "#b45309" } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "income" && <IncomeCard />}
      {tab === "balance" && <BalanceSheetCard />}
      {tab === "cashflow" && <CashFlowCard />}
      {tab === "trial" && <TrialBalanceCard />}
      {tab === "ledger" && <LedgerCard />}
    </div>
  );
}
