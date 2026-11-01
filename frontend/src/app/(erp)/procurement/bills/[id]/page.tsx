import { PurchasingBillDetails } from "@/components/procurement/PurchaseDocuments";
export default async function BillPage({params}: {params: Promise<{id: string}>}) { const {id} = await params; return <PurchasingBillDetails id={id} />; }
