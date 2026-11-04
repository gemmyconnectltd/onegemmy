"use client";
import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SaleDocumentById } from "@/components/sales/SaleDocumentDrawer";
export default function OrderDetails({params}: {params: Promise<{id:string}>}) {
  const {id} = use(params); const router = useRouter();
  return <div><Link href="/sales/orders" className="text-accent">Sales orders</Link><SaleDocumentById orderId={id} onClose={()=>router.back()}/></div>;
}
