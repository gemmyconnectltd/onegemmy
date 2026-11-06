"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Recovery } from "@/components/data-management/Recovery";
import { BusinessPicker } from "@/components/data-management/BusinessPicker";
import { PageLoader } from "@/components/ui/PageLoader";

function Content() {
  const tenant = useSearchParams().get("tenant");
  return tenant ? <Recovery tenantId={tenant} /> : <BusinessPicker hrefFor={(id) => `/data-management/recovery?tenant=${id}`} />;
}
export default function RecoveryPage() { return <Suspense fallback={<PageLoader />}><Content /></Suspense>; }
