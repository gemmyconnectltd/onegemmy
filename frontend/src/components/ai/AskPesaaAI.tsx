"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Clock, MapPin, Sparkles, SquarePen, X } from "lucide-react";
import { aiApi, type AiReply, type AiSuggestion } from "@/lib/api";
import { useAiChat, useAiConversations, useAiStatus, useAiSuggestions, useDeleteAiConversation, useMyBranches } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth";
import { AI_STATE_EVENT, ASK_AI_EVENT } from "@/lib/support";
import { cn } from "@/lib/utils";
import { AiComposer } from "./AiComposer";
import { AiHistory } from "./AiHistory";
import { AiAvatar, AssistantMessage, Thinking, UserMessage, type Turn } from "./AiMessage";
import { AiWelcome } from "./AiWelcome";

/** Which Pesaa area the user is in → what the assistant suggests and which tools it is offered. */
function moduleFromPath(pathname: string): string {
  const seg = pathname.split("/").filter(Boolean)[0] ?? "";
  const known: Record<string, string> = {
    dashboard: "dashboard", sales: "sales", inventory: "inventory", accounting: "accounting", procurement: "procurement",
    customers: "customers", manufacturing: "manufacturing", hr: "hr", reports: "reports", services: "services", expenses: "accounting",
  };
  return known[seg] ?? "general";
}

const MODULE_LABEL: Record<string, string> = {
  dashboard: "Dashboard", sales: "Sales", inventory: "Inventory", accounting: "Accounting", procurement: "Purchases",
  customers: "Customers", manufacturing: "Manufacturing", hr: "HR", reports: "Reports", services: "Services", general: "Pesaa",
};
const moduleLabel = (m: string) => MODULE_LABEL[m] ?? m;
const ICON_BTN = "flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/** On phones the keyboard shrinks the *visual* viewport but not the layout one; follow it so the composer stays visible. */
function subscribeViewport(cb: () => void) {
  const vv = window.visualViewport;
  vv?.addEventListener("resize", cb);
  return () => vv?.removeEventListener("resize", cb);
}
const viewportSnapshot = () => (window.visualViewport && window.innerWidth < 640 ? Math.round(window.visualViewport.height) : -1);

export function AskPesaaAI() {
  const pathname = usePathname();
  const router = useRouter();
  const area = moduleFromPath(pathname);
  const { user, activeBranchId } = useAuth();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [input, setInput] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const viewportH = useSyncExternalStore(subscribeViewport, viewportSnapshot, () => -1);

  const status = useAiStatus({ enabled: open });
  const suggestions = useAiSuggestions(area, { enabled: open });
  const conversations = useAiConversations({ enabled: open && view === "history" });
  const branches = useMyBranches({ enabled: open });
  const chat = useAiChat();
  const deleteConv = useDeleteAiConversation();

  // "Inventory · All Branches": what the assistant is looking at. Informational only — the server resolves
  // tenant, branch and permissions itself from the signed-in user and the X-Branch-Id header.
  const branchName =
    branches.data?.items.find((b) => b.id === (user?.branchId ?? activeBranchId))?.name ?? "All Branches";

  const scrollToEnd = useCallback((force = false) => {
    if (!force && !stick.current) return;   // respect a user who scrolled up to read
    requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }));
  }, []);

  // The server already picked this page from its approved list; the client still refuses anything that isn't a plain
  // in-app path, so a bad value can never send the user to another site or run a script.
  const openApprovedPage = useCallback((nav: AiReply["navigate"]) => {
    if (!nav || !/^\/[a-z0-9_\-/]*$/.test(nav.href) || nav.href.startsWith("//")) return;
    router.push(nav.href);
    if (window.innerWidth < 640) setOpen(false);   // full-screen chat on phones would hide the page it just opened
  }, [router]);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || chat.isPending) return;
    setInput("");
    setView("chat");
    setTurns((t) => [...t.filter((x) => !x.error), { id: `u-${Date.now()}`, role: "user", text, at: new Date() }]);
    stick.current = true;
    scrollToEnd(true);
    try {
      const r: AiReply = (await chat.mutateAsync({ message: text, module: area, conversation_id: conversationId })).data;
      setConversationId(r.conversation_id);
      openApprovedPage(r.navigate);
      setTurns((t) => [...t, {
        id: r.message_id, role: "assistant", text: r.text, at: new Date(), blocks: r.blocks, links: r.links, actions: r.actions,
        followups: r.followups, degraded: r.degraded,
      }]);
    } catch (err) {
      const e = err as { detail?: string; status?: number };
      const offline = err instanceof TypeError;
      setTurns((t) => [...t, {
        id: `e-${Date.now()}`, role: "assistant", text: "", at: new Date(),
        retryText: e.status === 429 || e.status === 403 ? undefined : text,   // limits/permissions won't change on retry
        error: offline ? "Can't reach Pesaa right now. Check your connection and try again." : e.detail ?? "Something went wrong. Please try again.",
      }]);
    }
    scrollToEnd();
  }, [area, chat, conversationId, openApprovedPage, scrollToEnd]);

  // Other parts of the app (Support menu, dashboard insights) can open the assistant, optionally with a question.
  useEffect(() => {
    const onAsk = (e: Event) => {
      const q = (e as CustomEvent<{ question?: string }>).detail?.question;
      setOpen(true);
      if (q) { setTurns([]); setConversationId(undefined); void send(q); }
    };
    window.addEventListener(ASK_AI_EVENT, onAsk);
    return () => window.removeEventListener(ASK_AI_EVENT, onAsk);
  }, [send]);

  // Let the floating buttons step aside while the panel is open.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(AI_STATE_EVENT, { detail: { open } }));
    return () => { window.dispatchEvent(new CustomEvent(AI_STATE_EVENT, { detail: { open: false } })); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const newChat = () => { setTurns([]); setConversationId(undefined); setView("chat"); stick.current = true; };

  const openConversation = async (id: string) => {
    try {
      const msgs = (await aiApi.conversation(id)).data;
      setTurns(msgs.map((m) => ({
        id: m.id, role: m.role, text: m.content.text ?? "", at: new Date(m.created_at ?? Date.now()), blocks: m.content.blocks, links: m.content.links,
        actions: m.content.actions, followups: m.content.followups, degraded: m.content.degraded,
      })));
      setConversationId(id);
      setView("chat");
      stick.current = true;
      scrollToEnd(true);
    } catch {
      setTurns([{ id: "err", role: "assistant", text: "", at: new Date(), error: "Couldn't open that conversation." }]);
      setView("chat");
    }
  };

  const pick = (s: AiSuggestion) => {
    if (s.ask.endsWith(" ")) setInput(s.ask);   // a sentence starter ("Create a draft invoice for …"): let the user finish it
    else void send(s.ask);
  };

  const st = status.data;
  const unavailable = st && !st.enabled;
  const noQuota = st && st.remaining <= 0;
  const disabledReason = unavailable ? "Pesaa AI is switched off at the moment." : noQuota ? "You've used this month's AI allowance. It resets next month." : null;

  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Ask Pesaa AI" aria-pressed={open}
        className={cn(
          "relative flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold transition-colors active:scale-[0.98]",
          open ? "bg-accent text-white" : "bg-accent/10 text-accent hover:bg-accent/15",
        )}>
        <Sparkles size={15} />
        <span className="hidden md:inline">Ask Pesaa AI</span>
        {open && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-card" aria-hidden />}
      </button>

      {/* Portalled to <body>: the top bar's backdrop blur would otherwise become the containing block for this
          `fixed` panel. A docked panel, not a modal — no dimming backdrop, the page stays visible and usable. */}
      {open && createPortal(
        <aside role="dialog" aria-label="Pesaa AI assistant" style={viewportH > 0 ? { height: viewportH } : undefined}
          className="animate-drawer-right fixed right-0 top-0 z-50 flex h-dvh w-full flex-col border-l border-border bg-card shadow-[0_0_40px_rgba(0,0,0,0.10)] sm:w-[480px]">
          <header className="border-b border-border">
            <div className="flex h-16 items-center gap-2.5 px-4">
              <AiAvatar size={32} />
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold leading-tight text-foreground">Pesaa AI</h2>
                <p className="text-[12px] leading-tight text-muted">Your business copilot</p>
              </div>
              <button type="button" onClick={() => setView((v) => (v === "history" ? "chat" : "history"))} aria-pressed={view === "history"} aria-label="Conversation history" title="History"
                className={cn(ICON_BTN, view === "history" && "bg-accent/10 text-accent")}><Clock size={18} /></button>
              <button type="button" onClick={newChat} aria-label="New chat" title="New chat" className={ICON_BTN}><SquarePen size={18} /></button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close Pesaa AI" title="Close" className={ICON_BTN}><X size={19} /></button>
            </div>
            <p className="flex items-center gap-1.5 px-4 pb-2.5 text-[11.5px] font-medium text-muted">
              <MapPin size={11} className="flex-shrink-0" /> <span className="truncate">{moduleLabel(area)} · {branchName}</span>
            </p>
          </header>

          {view === "history" ? (
            <div className="min-h-0 flex-1">
              <AiHistory items={conversations.data} loading={conversations.isLoading} activeId={conversationId} moduleLabel={moduleLabel}
                onOpen={(id) => void openConversation(id)} onNew={newChat} onBack={() => setView("chat")}
                onDelete={(id) => { deleteConv.mutate(id); if (id === conversationId) newChat(); }} />
            </div>
          ) : (
            <div ref={scroller} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
              className="min-h-0 flex-1 space-y-3.5 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite">
              {turns.length === 0 ? (
                <AiWelcome suggestions={suggestions.data} loading={suggestions.isLoading} disabledReason={disabledReason} onPick={pick} />
              ) : turns.map((t, idx) => t.role === "user"
                ? <UserMessage key={t.id} turn={t} />
                : <AssistantMessage key={t.id} turn={t} showFollowups={idx === turns.length - 1} onRetry={(x) => void send(x)} onAsk={(q) => void send(q)} onNavigate={() => setOpen(false)} />)}
              {chat.isPending && <Thinking />}
            </div>
          )}

          <div className="pb-[env(safe-area-inset-bottom)]">
            <AiComposer value={input} onChange={setInput} onSend={() => void send(input)} pending={chat.isPending} disabled={!!unavailable || !!noQuota}
              autoFocus={open && view === "chat"} status={st}
              placeholder={unavailable ? "Pesaa AI is turned off" : noQuota ? "Monthly AI allowance used" : "Ask Pesaa AI..."} />
          </div>
        </aside>,
        document.body,
      )}
    </>
  );
}
