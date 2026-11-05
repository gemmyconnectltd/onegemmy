"use client";
import { use } from "react";
import { OperationView } from "@/components/data-management/OperationView";

export default function OperationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <OperationView id={id} />;
}
