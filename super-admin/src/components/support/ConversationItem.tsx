import Link from "next/link";
import { cn } from "@/lib/utils";
import { fmtListTime } from "@/lib/support/logic";
import type { Customer, SupportAgent, SupportConversation } from "@/lib/support/types";
import { Avatar, ChannelIcon } from "./Avatars";
import { StatusBadge } from "./StatusBadge";

export function ConversationItem({ conversation: c, customer, agent, selected }: { conversation: SupportConversation; customer?: Customer; agent?: SupportAgent; selected: boolean }) {
  const last = c.messages[c.messages.length - 1];
  const preview = last ? `${last.direction === "outbound" ? "You: " : last.direction === "note" ? "Note: " : ""}${last.body.replace(/\s+/g, " ")}` : "";
  return (
    <Link
      href={`/support/conversations/${c.id}`}
      aria-current={selected ? "true" : undefined}
      className={cn("block border-b border-border/70 px-3 py-3 transition-colors last:border-b-0", selected ? "bg-accent/10" : "hover:bg-surface")}
    >
      <div className="flex gap-3">
        <Avatar name={customer?.businessName ?? "?"} color={c.priority === "urgent" ? "#ef4444" : "#16a34a"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className={cn("min-w-0 flex-1 truncate text-[13px]", c.unread ? "font-bold text-foreground" : "font-semibold text-foreground")}>{customer?.businessName ?? "Unknown business"}</p>
            <span className="flex-shrink-0 text-[11px] text-muted">{fmtListTime(c.lastMessageAt)}</span>
          </div>
          <p className="truncate text-[12px] font-medium text-foreground/80">{c.subject}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <ChannelIcon channel={c.channel} size={12} className="flex-shrink-0" />
            <p className={cn("min-w-0 flex-1 truncate text-[12px]", c.unread ? "text-foreground" : "text-muted")}>{preview}</p>
            {c.unread > 0 && <span className="flex h-[18px] min-w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[10.5px] font-bold text-white" aria-label={`${c.unread} unread`}>{c.unread}</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={c.status} />
            {(c.priority === "high" || c.priority === "urgent") && <StatusBadge priority={c.priority} />}
            <span className="truncate text-[11px] text-muted">{agent ? agent.name : "Unassigned"}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
