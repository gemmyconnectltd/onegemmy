"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { FinancialHeader } from "./FinancialShared";
import { ReportPreview } from "./FinancialReports";
import { FinancialOperations } from "./FinancialOperations";
export function LedgerWorkspace() { const [drafts, setDrafts] = useState(false); return <div className="space-y-5"><FinancialHeader title="General Ledger" description="Posted journal lines with account filters, reconciliation and source references." actions={<Link href="/accounting/income" className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">Record income / manual entry</Link>} /><div className="flex gap-2"><Button variant={drafts ? "ghost" : "secondary"} onClick={() => setDrafts(false)}>Posted ledger</Button><Button variant={drafts ? "secondary" : "ghost"} onClick={() => setDrafts(true)}>Draft journals</Button></div>{drafts ? <FinancialOperations mode="pending" /> : <ReportPreview kind="general-ledger" />}</div>; }
