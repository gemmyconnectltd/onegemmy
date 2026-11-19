"use client";

import { use } from "react";
import { FeatureTree } from "@/components/features/FeatureTree";
import { PageHeader } from "@/components/ui/PageHeader";

export default function FeaturePartsPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const { focus } = use(searchParams);
  return <div className="space-y-5">
    <PageHeader title="Submodules & features" subtitle="The optional parts inside each module. Switch one off for every business here; restrict it for one business under Access by business." />
    <FeatureTree focus={focus} />
  </div>;
}
