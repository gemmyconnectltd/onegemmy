import Link from "next/link";
import { ReceiptList } from "@/components/procurement/PurchaseDocuments";
import { PurchaseHeader } from "@/components/procurement/PurchaseShared";
import { Button } from "@/components/ui/Button";
export default function ReceiptsPage() { return <div className="space-y-5"><PurchaseHeader title="Goods Receipts" description="Confirmed deliveries and their immutable receiving references." actions={<Link href="/procurement/orders"><Button>Choose order to receive</Button></Link>} /><ReceiptList /></div>; }
