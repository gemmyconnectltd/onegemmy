import { BillList } from "@/components/procurement/PurchaseDocuments";
import { PurchaseHeader } from "@/components/procurement/PurchaseShared";
export default function BillsPage() { return <div className="space-y-5"><PurchaseHeader title="Supplier Bills" description="Delivery liabilities, outstanding balances and partial payments." /><BillList /></div>; }
