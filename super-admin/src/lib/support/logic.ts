// Pure helpers shared by the Support screens: filtering, the WhatsApp service-window rule, validation, ids.
import type {
  Attachment, ChannelKind, Customer, ConversationFilterState, Priority, SupportAgent, SupportConversation,
} from "./types";

export const HOUR = 3_600_000;
export const WHATSAPP_WINDOW_MS = 24 * HOUR;

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
export const PRIORITIES: Priority[] = ["low", "normal", "high", "urgent"];
export const PLAN_COLORS: Record<string, string> = { Free: "#64748b", Starter: "#0284c7", Professional: "#8b5cf6", Enterprise: "#d97706" };

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

/**
 * WhatsApp's customer-service window: free-form replies are allowed for 24 hours after the customer's last message.
 * Outside it only an approved template may be sent. (Rule mirrored in the UI; enforced for real by Meta later.)
 */
export function whatsappWindow(lastInboundAt: string | null | undefined, now = Date.now()): { open: boolean; msLeft: number } {
  if (!lastInboundAt) return { open: false, msLeft: 0 };
  const msLeft = new Date(lastInboundAt).getTime() + WHATSAPP_WINDOW_MS - now;
  return { open: msLeft > 0, msLeft: Math.max(0, msLeft) };
}

export function fmtWindow(msLeft: number): string {
  const h = Math.floor(msLeft / HOUR);
  const m = Math.floor((msLeft % HOUR) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function filterConversations(list: SupportConversation[], customers: Customer[], f: ConversationFilterState): SupportConversation[] {
  const q = f.query.trim().toLowerCase();
  const byId = new Map(customers.map((c) => [c.id, c]));
  return list
    .filter((c) => (f.channel === "all" || c.channel === f.channel))
    .filter((c) => (f.status === "all" || c.status === f.status))
    .filter((c) => (f.priority === "all" || c.priority === f.priority))
    .filter((c) => (f.assignee === "all" ? true : f.assignee === "unassigned" ? c.assigneeId === null : c.assigneeId === f.assignee))
    .filter((c) => {
      if (!q) return true;
      const cu = byId.get(c.customerId);
      const last = c.messages[c.messages.length - 1]?.body ?? "";
      return [c.subject, cu?.businessName, cu?.contactName, cu?.email, last].some((s) => s?.toLowerCase().includes(q));
    })
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
}

export function agentById(agents: SupportAgent[], id: string | null): SupportAgent | undefined {
  return id ? agents.find((a) => a.id === id) : undefined;
}

// ── validation ────────────────────────────────────────────────────────────────

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (s: string) => EMAIL_RE.test(s.trim());
export const isPhone = (s: string) => /^\+?[0-9 ()-]{7,20}$/.test(s.trim());

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_ATTACHMENT = /^(image\/(png|jpe?g|webp|gif)|application\/pdf|text\/plain|text\/csv|application\/vnd\.(ms-excel|openxmlformats-officedocument\.spreadsheetml\.sheet))$/;

/** Reads picked files into attachment records (metadata + a local preview URL for images). Returns errors for rejects. */
export function filesToAttachments(files: FileList | File[], limit = 5): { ok: Attachment[]; errors: string[] } {
  const ok: Attachment[] = [];
  const errors: string[] = [];
  for (const f of Array.from(files)) {
    if (ok.length >= limit) { errors.push(`You can attach up to ${limit} files.`); break; }
    if (!ALLOWED_ATTACHMENT.test(f.type)) { errors.push(`${f.name}: this file type isn't supported (images, PDF, CSV, TXT, Excel).`); continue; }
    if (f.size > MAX_ATTACHMENT_BYTES) { errors.push(`${f.name}: larger than 10 MB.`); continue; }
    const isImage = f.type.startsWith("image/");
    ok.push({ id: newId("att"), name: f.name, sizeBytes: f.size, mime: f.type, kind: isImage ? "image" : "file", previewUrl: isImage ? URL.createObjectURL(f) : undefined });
  }
  return { ok, errors };
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const CHANNEL_LABEL: Record<ChannelKind, string> = { email: "Email", whatsapp: "WhatsApp" };

/** "14:05" today, "Yesterday", or "12 Oct": the compact time used in conversation lists. */
export function fmtListTime(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
  if (d.getTime() >= startToday.getTime()) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (d.getTime() >= startToday.getTime() - 86_400_000) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** "Today", "Yesterday" or "12 Oct 2026": separators inside a conversation thread. */
export function fmtDayLabel(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
  if (d.getTime() >= startToday.getTime()) return "Today";
  if (d.getTime() >= startToday.getTime() - 86_400_000) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
