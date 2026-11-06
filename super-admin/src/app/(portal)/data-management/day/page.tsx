"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { BusinessPicker } from "@/components/data-management/BusinessPicker";
import { DayReset } from "@/components/data-management/DayReset";
import { PageLoader } from "@/components/ui/PageLoader";

function Content() {
  const tenant = useSearchParams().get("tenant");
  return tenant ? <DayReset tenantId={tenant} /> : <BusinessPicker hrefFor={(id) => `/data-management/day?tenant=${id}`} title="Select the business whose day you want to review" />;
}
export default function DayPage() { return <Suspense fallback={<PageLoader />}><Content /></Suspense>; }
