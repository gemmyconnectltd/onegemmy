"use client";

import { MessageSquareText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSupport } from "@/lib/support/store";
import { ConversationList } from "./ConversationList";
import { ConversationThread } from "./ConversationThread";
import { CustomerDetailsPanel } from "./CustomerDetailsPanel";
import { EmptyState, ErrorState } from "./EmptyState";

/**
 * The three-column support workspace (list · conversation · customer). Large screens show all three; tablets drop the
 * details column into a drawer; phones show the list OR the conversation, one at a time.
 */
export function SupportWorkspace({ selectedId }: { selectedId?: string }) {
  const { data, loading } = useSupport();
  const selected = data?.conversations.find((c) => c.id === selectedId);
  const customer = data?.customers.find((c) => c.id === selected?.customerId);

  if (!loading && !data) return <ErrorState message="The demo data couldn't be loaded." />;

  return (
    <div className={cn("grid min-h-[420px] lg:min-h-[520px]", selectedId ? "h-[calc(100dvh-12.5rem)]" : "h-[calc(100dvh-17.5rem)]", "grid-cols-1 gap-3 lg:h-[calc(100dvh-14.5rem)] lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)_300px] grid-cols-1")}>
      <div className={cn("min-h-0", selectedId ? "hidden lg:block" : "block")}><ConversationList selectedId={selectedId} /></div>
      <div className={cn("min-h-0", selectedId ? "block" : "hidden lg:block")}>
        {selectedId ? <ConversationThread conversationId={selectedId} /> : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border bg-card"><EmptyState icon={MessageSquareText} title="Select a conversation" description="Choose a conversation on the left to read it and reply." /></div>
        )}
      </div>
      {selected && (
        <aside aria-label="Customer details" className="hidden min-h-0 overflow-y-auto rounded-xl border border-border bg-card xl:block">
          <CustomerDetailsPanel conversation={selected} customer={customer} />
        </aside>
      )}
    </div>
  );
}
