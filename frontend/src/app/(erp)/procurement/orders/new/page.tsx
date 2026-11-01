"use client";
import { useRouter } from "next/navigation";
import { PurchaseEditor } from "@/components/procurement/PurchaseEditor";
import { useAuth } from "@/lib/auth";
export default function NewPurchasePage() {
  const router = useRouter();
  const {hasPermission} = useAuth();
  if (!hasPermission("purchase_orders:create")) return <p role="alert">You do not have permission to create purchase orders.</p>;
  return <PurchaseEditor page onClose={() => router.push("/procurement/orders")} onSaved={order => router.push(`/procurement/orders/${order.id}`)} />;
}
