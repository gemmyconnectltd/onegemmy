"use client";

import { Suspense } from "react";
import { PlatformOverview } from "@/components/admin/overview/PlatformOverview";
import { PageLoader } from "@/components/ui/PageLoader";

export default function AdminOverviewPage() {
  // PlatformOverview reads its filters from the URL (useSearchParams), which
  // must sit inside a Suspense boundary for static prerendering.
  return (
    <Suspense fallback={<PageLoader />}>
      <PlatformOverview />
    </Suspense>
  );
}
