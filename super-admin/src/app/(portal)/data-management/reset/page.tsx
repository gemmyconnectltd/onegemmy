"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { BusinessPicker } from "@/components/data-management/BusinessPicker";
import { ResetBusinessData } from "@/components/data-management/ResetBusinessData";
import { PageLoader } from "@/components/ui/PageLoader";

function Content() {
  const tenant = useSearchParams().get("tenant");
  return tenant ? <ResetBusinessData tenantId={tenant} /> : <BusinessPicker hrefFor={(id) => `/data-management/reset?tenant=${id}`} title="Select the business to reset" />;
}
export default function ResetPage() { return <Suspense fallback={<PageLoader />}><Content /></Suspense>; }
