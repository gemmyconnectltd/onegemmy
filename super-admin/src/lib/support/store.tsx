"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { HOUR, newId } from "./logic";
import { supportService } from "./service";
import type {
  ActivityEntry, AgentAvailability, Attachment, ChannelKind, ConversationFilterState, ConversationStatus, EmailTemplate, NewMessageDraft, Priority,
  QuickReply, SupportConversation, SupportMessage, SupportSettings, SupportState, AssignmentRules, WhatsAppTemplate,
} from "./types";

// Demo store. Every mutation here changes ONLY this browser's sample data: nothing is sent to a customer and nothing
// reaches a server. Components talk to the `actions` below, never to the reducer, so the real API can replace it later.

export const DEFAULT_FILTERS: ConversationFilterState = { query: "", channel: "all", status: "all", assignee: "all", priority: "all" };

interface Store {
  data: SupportState | null;
  loading: boolean;
  filters: ConversationFilterState;
}

type Action =
  | { type: "loaded"; data: SupportState }
  | { type: "mutate"; fn: (s: SupportState) => SupportState }
  | { type: "filters"; patch: Partial<ConversationFilterState> };

function reducer(state: Store, action: Action): Store {
  switch (action.type) {
    case "loaded": return { ...state, data: action.data, loading: false };
    case "mutate": return state.data ? { ...state, data: action.fn(state.data) } : state;
    case "filters": return { ...state, filters: { ...state.filters, ...action.patch } };
  }
}

const iso = () => new Date().toISOString();
const act = (text: string): ActivityEntry => ({ id: newId("act"), at: iso(), text });

function patchConversation(s: SupportState, id: string, fn: (c: SupportConversation) => SupportConversation): SupportState {
  return { ...s, conversations: s.conversations.map((c) => (c.id === id ? fn(c) : c)) };
}

export interface SendInput {
  body: string;
  mode: "reply" | "note";
  attachments?: Attachment[];
  subject?: string;
  templateName?: string;
}

export interface SupportActions {
  setFilters: (patch: Partial<ConversationFilterState>) => void;
  resetFilters: () => void;
  markRead: (conversationId: string) => void;
  sendMessage: (conversationId: string, input: SendInput) => void;
  simulateCustomerReply: (conversationId: string) => void;
  setStatus: (conversationId: string, status: ConversationStatus) => void;
  assign: (conversationId: string, agentId: string | null) => void;
  setPriority: (conversationId: string, priority: Priority) => void;
  addTag: (conversationId: string, tag: string) => void;
  removeTag: (conversationId: string, tag: string) => void;
  setReplyDraft: (key: string, text: string) => void;
  createConversation: (input: { customerId: string; channel: ChannelKind; subject: string; body: string; attachments?: Attachment[]; templateName?: string }) => string;
  saveNewMessageDraft: (draft: Omit<NewMessageDraft, "id" | "updatedAt"> & { id?: string }) => string;
  deleteNewMessageDraft: (id: string) => void;
  upsertEmailTemplate: (t: Omit<EmailTemplate, "id" | "updatedAt"> & { id?: string }) => string;
  duplicateEmailTemplate: (id: string) => void;
  toggleArchiveEmailTemplate: (id: string) => void;
  deleteEmailTemplate: (id: string) => void;
  upsertWhatsAppTemplate: (t: Omit<WhatsAppTemplate, "id" | "updatedAt"> & { id?: string }) => string;
  duplicateWhatsAppTemplate: (id: string) => void;
  deleteWhatsAppTemplate: (id: string) => void;
  upsertQuickReply: (q: Omit<QuickReply, "id"> & { id?: string }) => void;
  deleteQuickReply: (id: string) => void;
  setAgentAvailability: (agentId: string, availability: AgentAvailability) => void;
  updateSettings: (patch: Partial<SupportSettings>) => void;
  updateRules: (patch: Partial<AssignmentRules>) => void;
  resetDemo: () => Promise<void>;
}

interface Ctx { data: SupportState | null; loading: boolean; filters: ConversationFilterState; actions: SupportActions }
const SupportContext = createContext<Ctx | null>(null);

export function SupportProvider({ children }: { children: ReactNode }) {
  const [store, dispatch] = useReducer(reducer, { data: null, loading: true, filters: DEFAULT_FILTERS });
  const loadedRef = useRef(false);

  // Hydration safety: nothing is read from storage until after mount.
  useEffect(() => {
    let cancelled = false;
    void supportService.load().then((data) => { if (!cancelled) { loadedRef.current = true; dispatch({ type: "loaded", data }); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!store.data || !loadedRef.current) return;
    const id = setTimeout(() => supportService.save(store.data!), 400);
    return () => clearTimeout(id);
  }, [store.data]);

  // Save immediately when the tab is hidden or closed, so a quick reload never loses the last edit.
  const latestRef = useRef<SupportState | null>(null);
  useEffect(() => { latestRef.current = store.data; }, [store.data]);
  useEffect(() => {
    const flush = () => { if (loadedRef.current && latestRef.current) supportService.save(latestRef.current); };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => { window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", onHide); };
  }, []);

  const mutate = useCallback((fn: (s: SupportState) => SupportState) => dispatch({ type: "mutate", fn }), []);

  const actions = useMemo<SupportActions>(() => ({
    setFilters: (patch) => dispatch({ type: "filters", patch }),
    resetFilters: () => dispatch({ type: "filters", patch: DEFAULT_FILTERS }),

    markRead: (id) => mutate((s) => patchConversation(s, id, (c) => (c.unread ? { ...c, unread: 0 } : c))),

    sendMessage: (id, input) => mutate((s) => patchConversation(s, id, (c) => {
      const me = s.agents.find((a) => a.isYou);
      const msg: SupportMessage = {
        id: newId("msg"), conversationId: id, direction: input.mode === "note" ? "note" : "outbound", channel: c.channel,
        authorName: me?.name ?? "You", authorId: me?.id, body: input.body.trim(), sentAt: iso(),
        subject: c.channel === "email" ? (input.subject ?? `Re: ${c.subject}`) : undefined,
        // DEMO: nothing is delivered. "demo" is shown to the agent as "Demo: not sent".
        delivery: input.mode === "note" ? undefined : "demo", templateName: input.templateName, attachments: input.attachments ?? [],
      };
      const reply = input.mode === "reply";
      return {
        ...c, messages: [...c.messages, msg], lastMessageAt: msg.sentAt, unread: 0,
        status: reply && c.status === "open" ? "pending" : c.status,
        activity: [...c.activity, act(input.mode === "note" ? "Internal note added" : input.templateName ? `Template “${input.templateName}” prepared (demo, not sent)` : "Reply prepared (demo, not sent)")],
      };
    })),

    simulateCustomerReply: (id) => mutate((s) => patchConversation(s, id, (c) => {
      const cu = s.customers.find((x) => x.id === c.customerId);
      const msg: SupportMessage = {
        id: newId("msg"), conversationId: id, direction: "inbound", channel: c.channel, authorName: cu?.contactName ?? "Customer",
        body: "Thanks for the quick reply! (demo message simulating a customer response)", subject: c.channel === "email" ? `Re: ${c.subject}` : undefined,
        sentAt: iso(), attachments: [],
      };
      return { ...c, messages: [...c.messages, msg], lastMessageAt: msg.sentAt, lastInboundAt: msg.sentAt, unread: c.unread + 1, status: c.status === "resolved" || c.status === "pending" ? "open" : c.status,
        activity: [...c.activity, act("Customer replied (simulated for the demo)")] };
    })),

    setStatus: (id, status) => mutate((s) => patchConversation(s, id, (c) => ({
      ...c, status, snoozedUntil: status === "snoozed" ? new Date(Date.now() + 24 * HOUR).toISOString() : null,
      activity: [...c.activity, act(status === "resolved" ? "Marked as resolved" : status === "open" && c.status === "resolved" ? "Reopened" : status === "snoozed" ? "Snoozed for 24 hours" : `Status set to ${status[0].toUpperCase()}${status.slice(1)}`)],
    }))),

    assign: (id, agentId) => mutate((s) => patchConversation(s, id, (c) => ({
      ...c, assigneeId: agentId,
      activity: [...c.activity, act(agentId ? `Assigned to ${s.agents.find((a) => a.id === agentId)?.name ?? "agent"}` : "Unassigned")],
    }))),

    setPriority: (id, priority) => mutate((s) => patchConversation(s, id, (c) => ({ ...c, priority, activity: [...c.activity, act(`Priority set to ${priority[0].toUpperCase()}${priority.slice(1)}`)] }))),

    addTag: (id, tag) => {
      const t = tag.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 24);
      if (!t) return;
      mutate((s) => patchConversation(s, id, (c) => (c.tags.includes(t) ? c : { ...c, tags: [...c.tags, t] })));
    },
    removeTag: (id, tag) => mutate((s) => patchConversation(s, id, (c) => ({ ...c, tags: c.tags.filter((x) => x !== tag) }))),

    setReplyDraft: (key, text) => mutate((s) => {
      const next = { ...s.replyDrafts };
      if (text) next[key] = text; else delete next[key];
      return { ...s, replyDrafts: next };
    }),

    createConversation: (input) => {
      const id = newId("cv");
      mutate((s) => {
        const me = s.agents.find((a) => a.isYou);
        const cu = s.customers.find((c) => c.id === input.customerId);
        const now = iso();
        const msg: SupportMessage = {
          id: newId("msg"), conversationId: id, direction: "outbound", channel: input.channel, authorName: me?.name ?? "You", authorId: me?.id,
          body: input.body.trim(), subject: input.channel === "email" ? input.subject : undefined, sentAt: now, delivery: "demo", templateName: input.templateName, attachments: input.attachments ?? [],
        };
        const conv: SupportConversation = {
          id, customerId: input.customerId, channel: input.channel, subject: input.subject || `Message to ${cu?.businessName ?? "customer"}`,
          status: "pending", priority: s.settings.defaultPriority, assigneeId: me?.id ?? null, tags: [], unread: 0, snoozedUntil: null,
          createdAt: now, lastMessageAt: now, lastInboundAt: null, messages: [msg], activity: [act(`Conversation started by you (${input.channel}, demo: not sent)`)],
        };
        return { ...s, conversations: [conv, ...s.conversations] };
      });
      return id;
    },

    saveNewMessageDraft: (draft) => {
      const id = draft.id ?? newId("draft");
      mutate((s) => {
        const entry: NewMessageDraft = { ...draft, id, updatedAt: iso() };
        const exists = s.newMessageDrafts.some((d) => d.id === id);
        return { ...s, newMessageDrafts: exists ? s.newMessageDrafts.map((d) => (d.id === id ? entry : d)) : [entry, ...s.newMessageDrafts] };
      });
      return id;
    },
    deleteNewMessageDraft: (id) => mutate((s) => ({ ...s, newMessageDrafts: s.newMessageDrafts.filter((d) => d.id !== id) })),

    upsertEmailTemplate: (t) => {
      const id = t.id ?? newId("et");
      mutate((s) => {
        const entry: EmailTemplate = { ...t, id, updatedAt: iso() };
        return { ...s, emailTemplates: t.id ? s.emailTemplates.map((x) => (x.id === id ? entry : x)) : [entry, ...s.emailTemplates] };
      });
      return id;
    },
    duplicateEmailTemplate: (id) => mutate((s) => {
      const src = s.emailTemplates.find((t) => t.id === id);
      return src ? { ...s, emailTemplates: [{ ...src, id: newId("et"), name: `${src.name} (copy)`, active: false, archived: false, updatedAt: iso() }, ...s.emailTemplates] } : s;
    }),
    toggleArchiveEmailTemplate: (id) => mutate((s) => ({ ...s, emailTemplates: s.emailTemplates.map((t) => (t.id === id ? { ...t, archived: !t.archived, active: t.archived ? t.active : false, updatedAt: iso() } : t)) })),
    deleteEmailTemplate: (id) => mutate((s) => ({ ...s, emailTemplates: s.emailTemplates.filter((t) => t.id !== id) })),

    upsertWhatsAppTemplate: (t) => {
      const id = t.id ?? newId("wt");
      mutate((s) => {
        const entry: WhatsAppTemplate = { ...t, id, updatedAt: iso() };
        return { ...s, whatsappTemplates: t.id ? s.whatsappTemplates.map((x) => (x.id === id ? entry : x)) : [entry, ...s.whatsappTemplates] };
      });
      return id;
    },
    duplicateWhatsAppTemplate: (id) => mutate((s) => {
      const src = s.whatsappTemplates.find((t) => t.id === id);
      return src ? { ...s, whatsappTemplates: [{ ...src, id: newId("wt"), name: `${src.name}_copy`, status: "draft", rejectionReason: undefined, updatedAt: iso() }, ...s.whatsappTemplates] } : s;
    }),
    deleteWhatsAppTemplate: (id) => mutate((s) => ({ ...s, whatsappTemplates: s.whatsappTemplates.filter((t) => t.id !== id) })),

    upsertQuickReply: (q) => mutate((s) => {
      const entry: QuickReply = { id: q.id ?? newId("qr"), label: q.label, text: q.text };
      return { ...s, quickReplies: q.id ? s.quickReplies.map((x) => (x.id === q.id ? entry : x)) : [...s.quickReplies, entry] };
    }),
    deleteQuickReply: (id) => mutate((s) => ({ ...s, quickReplies: s.quickReplies.filter((q) => q.id !== id) })),

    setAgentAvailability: (id, availability) => mutate((s) => ({ ...s, agents: s.agents.map((a) => (a.id === id ? { ...a, availability } : a)) })),
    updateSettings: (patch) => mutate((s) => ({ ...s, settings: { ...s.settings, ...patch } })),
    updateRules: (patch) => mutate((s) => ({ ...s, rules: { ...s.rules, ...patch } })),

    resetDemo: async () => {
      const fresh = await supportService.reset();
      dispatch({ type: "loaded", data: fresh });
      dispatch({ type: "filters", patch: DEFAULT_FILTERS });
    },
  }), [mutate]);

  const value = useMemo(() => ({ data: store.data, loading: store.loading, filters: store.filters, actions }), [store.data, store.loading, store.filters, actions]);
  return <SupportContext.Provider value={value}>{children}</SupportContext.Provider>;
}

export function useSupport(): Ctx {
  const ctx = useContext(SupportContext);
  if (!ctx) throw new Error("useSupport must be used inside <SupportProvider>");
  return ctx;
}
