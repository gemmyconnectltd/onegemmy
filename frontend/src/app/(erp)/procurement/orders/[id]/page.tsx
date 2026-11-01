import { PurchaseDetails } from "@/components/procurement/PurchaseDetails";
export default async function PurchasePage({params}: {params: Promise<{id: string}>}) { const {id} = await params; return <PurchaseDetails id={id} />; }
