"use client";

import { AlertCircle, Check, CheckCheck, Clock, Globe, Mail, MessageCircle } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { Channel, Priority } from "@/lib/api";

export const CHANNEL_META: Record<Channel, { label: string; tone: Tone; icon: typeof Mail }> = {
  whatsapp: { label: "WhatsApp", tone: "green", icon: MessageCircle },
  email: { label: "Email", tone: "blue", icon: Mail },
  portal: { label: "Help & Support", tone: "violet", icon: Globe },
};

export function ChannelBadge({ channel, compact }: { channel: Channel; compact?: boolean }) {
  const m = CHANNEL_META[channel];
  return <Badge tone={m.tone}><m.icon size={11} />{!compact && m.label}</Badge>;
}

export const PRIORITY_TONE: Record<Priority, Tone> = { low: "slate", normal: "blue", high: "amber", urgent: "red" };
export const PriorityBadge = ({ priority }: { priority: Priority }) => <Badge tone={PRIORITY_TONE[priority]} className="capitalize">{priority}</Badge>;

export function Avatar({ name, size = 36 }: { name: string | null | undefined; size?: number }) {
  const initials = (name?.trim() || "?").split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "?";
  return <span style={{ width: size, height: size }} className="flex flex-shrink-0 items-center justify-center rounded-full bg-accent/10 text-[12px] font-bold text-accent">{initials}</span>;
}

export function DeliveryTicks({ status, error }: { status: string | null; error?: string | null }) {
  if (status === "failed") return <span title={error ?? "Not delivered"} className="flex items-center gap-1 text-red-500"><AlertCircle size={12} /> Failed</span>;
  if (status === "read") return <CheckCheck size={13} className="text-accent" aria-label="Read" />;
  if (status === "delivered") return <CheckCheck size={13} aria-label="Delivered" />;
  if (status === "sent") return <Check size={13} aria-label="Sent" />;
  if (status === "pending") return <Clock size={12} aria-label="Sending" />;
  return null;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)}d`;
  return new Date(iso).toLocaleDateString("en", { day: "numeric", month: "short" });
}

export const clock = (iso: string) => new Date(iso).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
export const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export function Toggle2({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={cn("rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors", active ? "bg-accent text-white" : "text-muted hover:text-foreground")}>{children}</button>;
}
