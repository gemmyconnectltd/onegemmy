// TanStack Query hooks for the Customer Support center. The server pushes "something changed" events over SSE
// (see stream.ts), which invalidate exactly the queries below — no polling.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supportApi, type ConversationView, type Priority, type SupportSettings, type TicketStatus } from "@/lib/api";

export const SUPPORT_KEY = ["support"] as const;

export const useSupportSummary = () => useQuery({ queryKey: [...SUPPORT_KEY, "summary"], queryFn: () => supportApi.summary().then((r) => r.data) });

export const useConversations = (p: { view: ConversationView; channel?: string; search?: string }) =>
  useQuery({ queryKey: [...SUPPORT_KEY, "conversations", p], queryFn: () => supportApi.conversations(p).then((r) => r.data), placeholderData: (prev) => prev });

export const useConversation = (id: string | null) =>
  useQuery({ queryKey: [...SUPPORT_KEY, "conversation", id], queryFn: () => supportApi.conversation(id!).then((r) => r.data), enabled: !!id });

/** Messages newest page first; `fetchNextPage` loads OLDER ones. */
export const useMessages = (id: string | null) =>
  useInfiniteQuery({
    queryKey: [...SUPPORT_KEY, "messages", id],
    enabled: !!id,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => supportApi.messages(id!, pageParam).then((r) => r.data),
    getNextPageParam: (last) => (last.has_more && last.items.length ? last.items[0].created_at : undefined),
  });

export const useRelated = (id: string | null) =>
  useQuery({ queryKey: [...SUPPORT_KEY, "related", id], queryFn: () => supportApi.related(id!).then((r) => r.data), enabled: !!id });

export const useTickets = (p: { status?: string; priority?: string; assigned?: string; search?: string; page?: number }) =>
  useQuery({ queryKey: [...SUPPORT_KEY, "tickets", p], queryFn: () => supportApi.tickets(p).then((r) => r.data), placeholderData: (prev) => prev });

export const useTeam = () => useQuery({ queryKey: [...SUPPORT_KEY, "team"], queryFn: () => supportApi.team().then((r) => r.data) });
export const useSupportSettings = () => useQuery({ queryKey: [...SUPPORT_KEY, "settings"], queryFn: () => supportApi.settings().then((r) => r.data) });
export const useSupportChannels = (opts?: { refetchInterval?: number }) =>
  useQuery({ queryKey: [...SUPPORT_KEY, "channels"], queryFn: () => supportApi.channels().then((r) => r.data), refetchInterval: opts?.refetchInterval });

/** Any support mutation refreshes every support query: the lists are small and this keeps every panel consistent. */
function useSupportMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: SUPPORT_KEY }) });
}

export const useReply = () => useSupportMutation(({ id, body, tokens }: { id: string; body: string; tokens: string[] }) => supportApi.reply(id, body, tokens));
export const useRetry = () => useSupportMutation(({ id, messageId }: { id: string; messageId: string }) => supportApi.retry(id, messageId));
export const useNote = () => useSupportMutation(({ id, body }: { id: string; body: string }) => supportApi.note(id, body));
export const useAssign = () => useSupportMutation(({ id, userId }: { id: string; userId: string | null }) => supportApi.assign(id, userId));
export const useSetConversationStatus = () => useSupportMutation(({ id, status }: { id: string; status: "open" | "resolved" }) => supportApi.setStatus(id, status));
export const useSetPriority = () => useSupportMutation(({ id, priority }: { id: string; priority: Priority }) => supportApi.setPriority(id, priority));
export const useMarkRead = () => useSupportMutation((id: string) => supportApi.markRead(id));
export const useToTicket = () => useSupportMutation((id: string) => supportApi.toTicket(id));
export const useCreateTicket = () => useSupportMutation(supportApi.createTicket);
export const useUpdateTicket = () => useSupportMutation(({ id, ...d }: { id: string; subject?: string; status?: TicketStatus; priority?: Priority; assigned_to?: string; unassign?: boolean }) => supportApi.updateTicket(id, d));
export const useAddMember = () => useSupportMutation(supportApi.addMember);
export const useUpdateMember = () => useSupportMutation(({ id, ...d }: { id: string; role?: string; is_active?: boolean }) => supportApi.updateMember(id, d));
export const useSaveSupportSettings = () => useSupportMutation((d: SupportSettings) => supportApi.saveSettings(d));
export const useWhatsappConnect = () => useSupportMutation(() => supportApi.whatsappConnect());
export const useWhatsappDisconnect = () => useSupportMutation(() => supportApi.whatsappDisconnect());
export const useEmailSync = () => useSupportMutation(() => supportApi.emailSync());
