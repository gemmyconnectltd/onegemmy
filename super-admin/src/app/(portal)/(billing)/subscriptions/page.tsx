import { LiveBillingList } from "@/components/billing/LiveBilling";
export default async function Page({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  return <LiveBillingList kind="subscriptions" initialPlan={plan} />;
}
