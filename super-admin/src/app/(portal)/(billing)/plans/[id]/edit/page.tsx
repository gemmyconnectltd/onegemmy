"use client";

import { useParams } from "next/navigation";
import { PlanWizard } from "@/components/billing/PlanWizard";
import { EmptyState } from "@/components/billing/ui";
import { useBilling } from "@/lib/billing/store";

export default function EditPlanPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useBilling();
  const plan = state?.plans.find((p) => p.id === id);
  if (!plan) return <EmptyState title="Plan not found" hint="It may have been removed in demo mode." />;
  return <PlanWizard key={plan.id} plan={plan} />;
}
