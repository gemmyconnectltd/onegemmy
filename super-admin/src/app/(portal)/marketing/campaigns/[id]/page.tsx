"use client";

import { useParams, useRouter } from "next/navigation";
import { useCampaign } from "@/lib/marketing/hooks";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { ErrorState } from "@/components/ui/EmptyState";
import { CampaignWizard } from "@/components/marketing/CampaignWizard";
import { CampaignResults } from "@/components/marketing/CampaignResults";
import { StatusPill } from "@/components/marketing/shared";
import { BackLink } from "@/components/traffic/shared";

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useCampaign(id);
  if (isLoading) return <PageLoader variant="page" />;
  if (isError || !data) return <ErrorState message="Could not load this campaign." onRetry={() => void refetch()} />;
  const editable = data.status === "draft" || data.status === "scheduled";
  return (
    <div className="space-y-4">
      <PageHeader back={<BackLink href="/marketing/campaigns" label="Back to campaigns" />} title={data.name} subtitle={editable ? "Set up, choose an audience, write the email and send." : data.subject} actions={<StatusPill status={data.status} />} />
      {editable ? <CampaignWizard key={data.id} campaign={data} onDone={() => undefined} /> : <CampaignResults campaign={data} onDuplicated={(nid) => router.push(`/marketing/campaigns/${nid}`)} />}
    </div>
  );
}
