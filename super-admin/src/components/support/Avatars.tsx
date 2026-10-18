import { Mail, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/support/logic";
import type { ChannelKind, SupportAgent } from "@/lib/support/types";

export function Avatar({ name, color = "#16a34a", size = 36, className }: { name: string; color?: string; size?: number; className?: string }) {
  return (
    <span className={cn("flex flex-shrink-0 items-center justify-center rounded-full font-bold text-white", className)} style={{ width: size, height: size, backgroundColor: color, fontSize: Math.max(10, size * 0.36) }} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function AgentAvatar({ agent, size = 28 }: { agent: SupportAgent; size?: number }) {
  return (
    <span className="relative inline-flex">
      <Avatar name={agent.name} color={agent.color} size={size} />
      <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card", agent.availability === "online" ? "bg-emerald-500" : agent.availability === "away" ? "bg-amber-500" : "bg-slate-400")} title={agent.availability} />
    </span>
  );
}

export function ChannelIcon({ channel, size = 14, className }: { channel: ChannelKind; size?: number; className?: string }) {
  return channel === "email"
    ? <Mail size={size} className={cn("text-sky-600", className)} aria-label="Email" />
    : <MessageCircle size={size} className={cn("text-emerald-600", className)} aria-label="WhatsApp" />;
}
