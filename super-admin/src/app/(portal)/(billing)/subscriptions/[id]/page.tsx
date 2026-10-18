import { LiveSubscriptionDetail } from "@/components/billing/LiveBilling";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiveSubscriptionDetail id={id} />;
}
