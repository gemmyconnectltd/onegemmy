import { request, qs } from "./client";
import type { SingleResponse } from "./types";

export interface AiCard {
  label: string;
  value: string;
  tone: "neutral" | "positive" | "attention" | "critical";
  hint?: string;
}

export interface AiSuggestion {
  label: string;
  /** Sent through the normal chat flow when clicked (a trailing space means "finish this sentence"). */
  ask: string;
  icon: "alert" | "package" | "file" | "chart" | "wallet" | "users" | "help" | "factory";
}

export interface AiFollowup {
  label: string;
  ask: string;
}

export interface AiBlock {
  type: string;
  heading?: string | null;
  tone?: "neutral" | "positive" | "attention" | "critical";
  /** A caveat about the data (e.g. missing thresholds). */
  note?: string | null;
  cards?: AiCard[];
  columns: string[];
  rows: (string | number)[][];
  /** Plain-language note on how the numbers were calculated. */
  how: string;
  period: { from: string; to: string } | null;
  currency: string;
  chart?: { type: "bar"; title: string; labels: string[]; values: number[]; currency: string | null } | null;
}

/** A draft the assistant prepared. NOTHING is saved until the user confirms it. */
export interface AiAction {
  id: string;
  kind: "invoice" | "purchase_order" | "payment_reminder";
  status: "pending" | "confirmed" | "cancelled";
  expires_at: string;
  title: string;
  summary: string;
  columns: string[];
  rows: (string | number)[][];
  total: string;
  warnings: string[];
  confirm_label: string;
  /** For a reminder: the exact email that will be sent. */
  message?: string;
}

export interface AiActionResult {
  kind: string;
  reference: string;
  href: string;
  message: string;
}

export interface AiInsight {
  id: string;
  module: string;
  severity: "positive" | "attention" | "info";
  title: string;
  detail: string;
  period: { from: string; to: string } | null;
  next_action: string;
  href: string;
  /** A ready-made question to open in the assistant for a fuller explanation. */
  question: string;
}

export interface AiReply {
  conversation_id: string;
  message_id: string;
  text: string;
  blocks: AiBlock[];
  links: { label: string; href: string }[];
  tools_used: string[];
  actions: AiAction[];
  followups?: AiFollowup[];
  /** true when the AI summary was unavailable and only calculated figures are shown. */
  degraded: boolean;
  /** A page the assistant was asked to open — chosen by the server from its approved list, never free text. */
  navigate?: { label: string; href: string } | null;
  provider: string;
}

export interface AiStatus {
  enabled: boolean;
  provider: string;
  monthly_limit: number;
  used_this_month: number;
  remaining: number;
}

export interface AiConversationSummary {
  id: string;
  title: string;
  module: string;
  updated_at: string | null;
}

export interface AiStoredMessage {
  id: string;
  role: "user" | "assistant";
  content: Partial<AiReply> & { text?: string };
  created_at: string | null;
}

export interface AiAdminSettings {
  enabled: boolean;
  default_monthly_limit: number;
  plan_limits: Record<string, number>;
  /** Read-only: the provider and key are deployment configuration. */
  provider: { configured: string; active: string; model: string; key_present: boolean };
}

export interface AiAdminUsage {
  days: number;
  requests: number;
  errors: number;
  blocked: number;
  tokens: number;
  est_cost_usd: number;
  avg_latency_ms: number;
  top_tenants: { tenant_id: string | null; name: string; requests: number; est_cost_usd: number }[];
  recent_errors: { at: string; provider: string; error: string | null }[];
}

export const aiApi = {
  chat: (data: { message: string; module: string; conversation_id?: string }) =>
    request<SingleResponse<AiReply>>("/ai/chat", { method: "POST", body: JSON.stringify(data) }),
  status: () => request<SingleResponse<AiStatus>>("/ai/status"),
  insights: () => request<SingleResponse<AiInsight[]>>("/ai/insights"),
  confirmAction: (id: string) => request<SingleResponse<AiActionResult>>(`/ai/actions/${id}/confirm`, { method: "POST" }),
  cancelAction: (id: string) => request<SingleResponse<unknown>>(`/ai/actions/${id}/cancel`, { method: "POST" }),
  suggestions: (module: string) => request<SingleResponse<AiSuggestion[]>>(`/ai/suggestions${qs({ module })}`),
  conversations: () => request<SingleResponse<AiConversationSummary[]>>("/ai/conversations"),
  conversation: (id: string) => request<SingleResponse<AiStoredMessage[]>>(`/ai/conversations/${id}`),
  deleteConversation: (id: string) => request<SingleResponse<unknown>>(`/ai/conversations/${id}`, { method: "DELETE" }),

  adminSettings: () => request<SingleResponse<AiAdminSettings>>("/admin/ai/settings"),
  updateAdminSettings: (data: { enabled?: boolean; default_monthly_limit?: number; plan_limits?: Record<string, number> }) =>
    request<SingleResponse<AiAdminSettings>>("/admin/ai/settings", { method: "PUT", body: JSON.stringify(data) }),
  adminUsage: (days = 30) => request<SingleResponse<AiAdminUsage>>(`/admin/ai/usage${qs({ days })}`),
};
