"use client";
import { use } from "react";
import { usePurchaseOrder } from "@/lib/api/hooks";
import { PageLoader } from "@/components/ui/PageLoader";
import { FinancialError } from "@/components/accounting/FinancialShared";
import { ReceivePurchase } from "@/components/procurement/ReceivePurchase";
import { usePurchasingScope } from "@/components/procurement/PurchaseShared";
import { useAuth } from "@/lib/auth";
export default function ReceivePage({params}: {params: Promise<{id: string}>}) {
  const {id} = use(params); const scope = usePurchasingScope(); const query = usePurchaseOrder(id, undefined, scope); const {hasPermission} = useAuth();
  if (query.isLoading) return <PageLoader />;
  if (query.error) return <FinancialError error={query.error} />;
  if (!query.data || !hasPermission("purchase_orders:update")) return <p role="alert">You do not have permission to receive this purchase.</p>;
  return <ReceivePurchase key={id} order={query.data} />;
}
