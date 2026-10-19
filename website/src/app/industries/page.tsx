import type { Metadata } from "next";
import { MarketingDirectory } from "@/components/marketing/MarketingDetailPage";
export const metadata: Metadata = { title: "Industries | Pesaa", description: "Explore Pesaa workflows for retail, wholesale, manufacturing and service businesses." };
export default function Page() { return <MarketingDirectory industry />; }
