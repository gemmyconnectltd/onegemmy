"use client";
import { use } from "react";
import { useRouter } from "next/navigation";
import { usePurchaseOrder } from "@/lib/api/hooks";
import { PurchaseEditor } from "@/components/procurement/PurchaseEditor";
import { FinancialError } from "@/components/accounting/FinancialShared";
import { PageLoader } from "@/components/ui/PageLoader";
import { usePurchasingScope } from "@/components/procurement/PurchaseShared";
import { useAuth } from "@/lib/auth";
export default function EditPurchasePage({params}: {params: Promise<{id: string}>}) {
  const {id} = use(params); const router = useRouter(); const scope = usePurchasingScope(); const query = usePurchaseOrder(id, undefined, scope); const {hasPermission} = useAuth();
  if (query.isLoading) return <PageLoader />;
  if (query.error) return <FinancialError error={query.error} />;
  if (!query.data || query.data.status !== "Draft" || !hasPermission("purchase_orders:update")) return <p role="alert">Only editable drafts can be changed.</p>;
  return <PurchaseEditor key={id} page initial={query.data} onClose={() => router.push(`/procurement/orders/${id}`)} onSaved={() => router.push(`/procurement/orders/${id}`)} />;
}
