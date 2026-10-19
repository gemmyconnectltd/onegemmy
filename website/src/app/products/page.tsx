import type { Metadata } from "next";
import { MarketingDirectory } from "@/components/marketing/MarketingDetailPage";
export const metadata: Metadata = { title: "Products | Pesaa", description: "Explore Pesaa products for sales, inventory, purchasing, expenses and business operations." };
export default function Page() { return <MarketingDirectory />; }
