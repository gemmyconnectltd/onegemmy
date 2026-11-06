"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CloseWizard } from "@/components/data-management/CloseWizard";
import { BusinessPicker } from "@/components/data-management/BusinessPicker";
import { PageLoader } from "@/components/ui/PageLoader";

function Content() {
  const tenant = useSearchParams().get("tenant");
  return tenant ? <CloseWizard tenantId={tenant} /> : <BusinessPicker hrefFor={(id) => `/data-management/close?tenant=${id}`} />;
}
export default function ClosePage() { return <Suspense fallback={<PageLoader />}><Content /></Suspense>; }
