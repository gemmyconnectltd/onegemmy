"use client";

import { useParams } from "next/navigation";
import { SupportWorkspace } from "@/components/support/SupportWorkspace";

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  return <SupportWorkspace selectedId={id} />;
}
