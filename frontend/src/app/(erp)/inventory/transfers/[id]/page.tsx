"use client";
import { use } from "react";
import Link from "next/link";
import { useStockTransfer } from "@/lib/api/hooks";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableScroll } from "@/components/ui/TableScroll";
import { LoadError } from "@/components/ui/LoadState";
export default function TransferDetails({params}: {params: Promise<{id:string}>}) {
  const {id} = use(params); const query = useStockTransfer(id);
  if(query.isLoading) return <PageLoader variant="page"/>;
  if(query.error || !query.data) return <LoadError title="Could not load this transfer" error={query.error ?? "Transfer not found"} onRetry={()=>void query.refetch()} />;
  const t = query.data;
  return <div className="space-y-6"><Link href="/inventory/transfers" className="text-accent">← Stock transfers</Link><h1 className="pesaa-page-title">{t.transfer_number}</h1><p className="text-sm text-muted">{t.from_branch_name||"Main store"} → {t.to_branch_name||"Main store"} · {t.status}</p><p className="text-sm">{t.notes}</p><TableScroll><table className="w-full"><thead><tr><th>Product</th><th>SKU</th><th>Quantity</th></tr></thead><tbody>{t.items.map(i=><tr key={i.id}><td>{i.product_name}</td><td>{i.sku||"—"}</td><td className="text-right tabular-nums">{i.quantity}</td></tr>)}</tbody></table></TableScroll><p className="text-sm text-muted">Transfers change location, leaving the business-wide quantity unchanged.</p></div>;
}
