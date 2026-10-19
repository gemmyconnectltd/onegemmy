import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { industries as items } from "@/lib/navigation";
import { marketingDetails } from "@/lib/marketing-details";
import { MarketingDetailPage } from "@/components/marketing/MarketingDetailPage";
export const dynamicParams = false;
export function generateStaticParams() { return items.map(item => ({ slug: item.href.split("/").at(-1)! })); }
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = items.find(item => item.href === "/industries/" + slug);
  if (!item) return {};
  return { title: `${item.title} | Pesaa`, description: marketingDetails[item.id].intro, alternates: { canonical: item.href } };
}
export default async function Page({ params }: Props) {
  const { slug } = await params;
  const item = items.find(item => item.href === "/industries/" + slug);
  if (!item) notFound();
  return <MarketingDetailPage item={item} detail={marketingDetails[item.id]} industry={true} />;
}
