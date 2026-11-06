"use client";
import { use } from "react";
import Link from "next/link";
import { History } from "lucide-react";
import { useTenant } from "@/lib/api/hooks";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Workspace } from "@/components/data-management/Workspace";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/ui/PageLoader";

// Businesses → a business → Data Management: the same workspace as the global page, already pointed at this business, inside the business's own frame.
export default function TenantDataPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const tenant = useTenant(id);
  if (tenant.isLoading) return <PageLoader />;
  if (tenant.isError || !tenant.data) return <ErrorState message="Could not load this business." onRetry={() => void tenant.refetch()} />;
  return (
    <BusinessShell tenant={tenant.data} panel="data" actions={<Link href={`/data-management/operations?tenant=${id}`}><Button variant="outline"><History size={14} /> Operation History</Button></Link>}>
      <Workspace tenantId={id} embedded />
    </BusinessShell>
  );
}
