"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { ConversationList } from "@/components/support/ConversationList";
import { ConversationThread } from "@/components/support/ConversationThread";
import { CustomerPanel } from "@/components/support/CustomerPanel";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/ui/PageLoader";
import type { ConversationView } from "@/lib/api";
import { useConversations } from "@/lib/support/hooks";

function InboxInner() {
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get("c");
  const [view, setView] = useState<ConversationView>("all");
  const [channel, setChannel] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [details, setDetails] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(t); }, [search]);

  const list = useConversations({ view, channel: channel || undefined, search: debounced || undefined });
  const open = (id: string | null) => router.replace(id ? `/support?c=${id}` : "/support", { scroll: false });

  return (
    // The inbox fills the viewport under the page header; on phones one panel shows at a time (list → conversation).
    <div className="grid h-[calc(100dvh-9.5rem)] min-h-[480px] grid-cols-1 overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)_300px]">
      <div className={`min-h-0 border-border lg:border-r ${selected ? "hidden lg:block" : ""}`}>
        <ConversationList items={list.data?.items ?? []} total={list.data?.total ?? 0} loading={list.isLoading} error={list.isError} selectedId={selected} onSelect={open}
          view={view} onView={setView} search={search} onSearch={setSearch} channel={channel} onChannel={setChannel} />
      </div>
      <div className={`min-h-0 min-w-0 ${selected ? "" : "hidden lg:block"}`}>
        {selected ? <ConversationThread key={selected} id={selected} onBack={() => open(null)} onOpenDetails={() => setDetails(true)} />
          : <div className="flex h-full items-center justify-center"><EmptyState icon={MessagesSquare} title="Select a conversation" description="Pick one from the list to read and reply." /></div>}
      </div>
      {selected && <div className="hidden min-h-0 border-l border-border 2xl:block"><CustomerPanel id={selected} onOpen={open} /></div>}
      <Drawer open={details && !!selected} onClose={() => setDetails(false)} side="right" size="md" title="Customer details">
        {selected && <CustomerPanel id={selected} onOpen={(id) => { setDetails(false); open(id); }} />}
      </Drawer>
    </div>
  );
}

export default function SupportInboxPage() {
  return <Suspense fallback={<PageLoader variant="compact" />}><InboxInner /></Suspense>;
}
