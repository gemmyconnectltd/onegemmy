"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDmBusiness, useDmMe } from "@/lib/api/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Notice } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/ui/PageLoader";
import { BusinessDirectory } from "./BusinessDirectory";
import { FlowShell } from "./FlowShell";
import { OPERATION_CARDS, cardFor } from "./operations";
import { errorText } from "./common";

/** Start an operation: choose the business (unless one is already chosen), then go straight to that operation's workspace. Nothing runs from here. */
export function NewOperation() {
  const router = useRouter();
  const params = useSearchParams();
  const op = params.get("op");
  const tenant = params.get("tenant");
  const card = cardFor(op);
  const me = useDmMe();
  const business = useDmBusiness(tenant ?? undefined);
  const perms = me.data?.permissions ?? [];
  const allowed = !!card && perms.includes("data:view") && perms.includes(card.permission);
  const target = tenant && card?.target && allowed ? card.target(tenant) : null;
  useEffect(() => { if (target) router.replace(target); }, [target, router]);

  const crumbs = [{ label: "Data Management", href: "/data-management" }, { label: "New operation", ...(card ? { href: "/data-management/new" } : {}) }, ...(card ? [{ label: card.title }] : [])];
  const steps = card?.steps ?? ["Select business", "Select operation", "Configure", "Preview", "Approval", "Execute", "Results"];
  const current = !tenant ? 0 : card ? 1 : 1;
  if (me.isLoading || (tenant && business.isLoading)) return <PageLoader />;
  if (!perms.includes("data:view")) return <EmptyState title="You do not have access to Data Management operations" description="Ask a platform administrator for the View business records and Preview operations permissions." />;
  if (tenant && business.error) return <ErrorState message={errorText(business.error)} />;
  const pick = (id: string) => router.push(`/data-management/new?${op ? `op=${op}&` : ""}tenant=${id}`);
  const b = business.data;

  return (
    <FlowShell title={card ? card.title : "New operation"} subtitle={card ? card.description : "Choose a business, then the operation. You preview the exact impact before anything changes."}
      crumbs={crumbs} steps={steps} current={current}
      business={b && <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-[13px]"><span className="font-semibold">{b.name}</span><Badge tone={b.status === "Active" ? "green" : "red"} dot>{b.status}</Badge>
        <Link href={`/data-management/new${op ? `?op=${op}` : ""}`} className="text-[12px] font-semibold text-accent hover:underline">Change</Link></div>}>
      {!tenant && <BusinessDirectory onPick={(x) => pick(x.id)} title="Select a business" subtitle={card ? `Choose the business for “${card.title}”.` : "Choose the business this operation is for."} />}
      {tenant && !card && (
        <div className="space-y-3"><h2 className="pesaa-card-title">Choose the operation</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{OPERATION_CARDS.map((c) => { const Icon = c.icon; return (
            <Link key={c.key} href={`/data-management/new?op=${c.key}&tenant=${tenant}`} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 hover:border-accent/40 hover:bg-surface/50 focus-visible:outline-2 focus-visible:outline-accent">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent"><Icon size={18} aria-hidden /></span>
              <span className="text-sm font-semibold">{c.title}</span><span className="text-[12.5px] text-muted">{c.description}</span></Link>); })}</div></div>
      )}
      {tenant && card && !card.target && card.unavailable && (
        <div className="max-w-2xl space-y-3 rounded-xl border border-border bg-card p-5">
          <Notice tone="blue">{card.title} is not available in Super Admin.</Notice>
          <p className="text-sm">{card.unavailable.why}</p>
          <p className="text-sm text-muted"><strong className="text-foreground">Instead:</strong> {card.unavailable.instead}</p>
          <div className="flex flex-wrap gap-2"><Link href={`/data-management?tenant=${tenant}`}><Button size="sm">Open the business workspace</Button></Link>
            {card.key === "export" && perms.includes("data:recovery") && <Link href={`/data-management/recovery?tenant=${tenant}`}><Button size="sm" variant="outline">Backups &amp; recovery</Button></Link>}</div>
        </div>
      )}
      {tenant && card?.target && !allowed && <Notice tone="amber">You need the Preview operations permission to start “{card.title}”. Ask a platform administrator for it.</Notice>}
      {target && <PageLoader />}
    </FlowShell>
  );
}
