import { request, qs, API_BASE, getStoredToken } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";

// Customer Support center (backend: /support/*). Staff-only except /support/my/*, which the customer app uses.

export type Channel = "whatsapp" | "email" | "portal";
export type Priority = "low" | "normal" | "high" | "urgent";
export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

export interface SupportAttachment { id: string; name: string; mime: string | null; size: number | null; url: string }
export interface SupportMessage {
  id: string; conversation_id: string; direction: "incoming" | "outgoing"; is_internal_note: boolean; sender_name: string | null;
  sender_user_id: string | null; body: string; attachments: SupportAttachment[]; delivery_status: string | null; delivery_error: string | null; created_at: string;
}
export interface SupportConversation {
  id: string; channel: Channel; subject: string | null; customer_name: string | null; customer_email: string | null; customer_phone: string | null;
  tenant_id: string | null; tenant_name: string | null; tenant_preferred_contact: "email" | "phone" | "whatsapp" | "all" | null; status: "open" | "resolved"; priority: Priority; assigned_to: string | null; assigned_name: string | null;
  unread_count: number; last_message_at: string | null; last_message_preview: string | null; resolved_at: string | null; created_at: string;
  ticket_id: string | null; ticket_reference: string | null;
}
export interface SupportTicket {
  id: string; reference: string; tenant_id: string | null; tenant_name: string | null; conversation_id: string; requester_user_id: string | null;
  requester_name: string | null; subject: string; status: TicketStatus; priority: Priority; assigned_to: string | null; assigned_name: string | null;
  resolved_at: string | null; created_at: string; updated_at: string;
}
export interface SupportStaff {
  id: string; email: string; full_name: string; role: "superadmin" | "support_manager" | "support_agent"; is_active: boolean; last_login: string | null;
  open_conversations: number; open_tickets: number;
}
export interface BusinessHoursDay { open: string; close: string }
export interface SupportSettings {
  timezone: string; hours: Record<string, BusinessHoursDay | null>; auto_ack_enabled: boolean; auto_ack_text: string; after_hours_text: string; retention_days: number | null;
}
export interface SupportChannels {
  whatsapp: { configured: boolean; status: string; number: string | null; last_connected_at: string | null; last_error: string | null };
  email: { outbound_configured: boolean; inbound_configured: boolean; mailbox: string | null; status: string; last_connected_at: string | null; last_error: string | null };
}
export interface SupportSummary { unread: number; unassigned: number; mine: number; whatsapp_status: string }
export type ConversationView = "all" | "unassigned" | "mine" | "resolved";

const B = "/support";

export const supportApi = {
  summary: () => request<SingleResponse<SupportSummary>>(`${B}/summary`),
  conversations: (p: { view: ConversationView; channel?: string; search?: string; page?: number }) =>
    request<PaginatedResponse<SupportConversation>>(`${B}/conversations${qs({ view: p.view, channel: p.channel, search: p.search, page: p.page ?? 1, page_size: 30 })}`),
  conversation: (id: string) => request<SingleResponse<SupportConversation>>(`${B}/conversations/${id}`),
  messages: (id: string, before?: string) =>
    request<SingleResponse<{ items: SupportMessage[]; has_more: boolean }>>(`${B}/conversations/${id}/messages${qs({ before, limit: 40 })}`),
  related: (id: string) => request<SingleResponse<{ previous: SupportConversation[]; tickets: SupportTicket[] }>>(`${B}/conversations/${id}/related`),
  reply: (id: string, body: string, attachmentTokens: string[]) =>
    request<SingleResponse<SupportMessage>>(`${B}/conversations/${id}/reply`, { method: "POST", body: JSON.stringify({ body, attachment_ids: attachmentTokens }) }),
  retry: (id: string, messageId: string) => request<SingleResponse<SupportMessage>>(`${B}/conversations/${id}/messages/${messageId}/retry`, { method: "POST" }),
  note: (id: string, body: string) => request<SingleResponse<SupportMessage>>(`${B}/conversations/${id}/notes`, { method: "POST", body: JSON.stringify({ body }) }),
  assign: (id: string, userId: string | null) => request<SingleResponse<SupportConversation>>(`${B}/conversations/${id}/assign`, { method: "POST", body: JSON.stringify({ user_id: userId }) }),
  setStatus: (id: string, status: "open" | "resolved") => request<SingleResponse<SupportConversation>>(`${B}/conversations/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  setPriority: (id: string, priority: Priority) => request<SingleResponse<SupportConversation>>(`${B}/conversations/${id}/priority`, { method: "POST", body: JSON.stringify({ priority }) }),
  markRead: (id: string) => request<SingleResponse<null>>(`${B}/conversations/${id}/read`, { method: "POST" }),
  toTicket: (id: string) => request<SingleResponse<SupportTicket>>(`${B}/conversations/${id}/ticket`, { method: "POST" }),
  upload: async (file: File): Promise<{ token: string; name: string; mime: string; size: number }> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_BASE}${B}/uploads`, { method: "POST", body: form, headers: { Authorization: `Bearer ${getStoredToken() ?? ""}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, detail: body.detail || body.message || "Upload failed" };
    return body.data;
  },
  tickets: (p: { status?: string; priority?: string; assigned?: string; search?: string; page?: number }) =>
    request<PaginatedResponse<SupportTicket>>(`${B}/tickets${qs({ status: p.status, priority: p.priority, assigned: p.assigned, search: p.search, page: p.page ?? 1, page_size: 30 })}`),
  createTicket: (d: { tenant_id?: string; subject: string; description: string; priority: Priority; customer_email?: string; customer_name?: string }) =>
    request<SingleResponse<SupportTicket>>(`${B}/tickets`, { method: "POST", body: JSON.stringify(d) }),
  updateTicket: (id: string, d: { subject?: string; status?: TicketStatus; priority?: Priority; assigned_to?: string; unassign?: boolean }) =>
    request<SingleResponse<SupportTicket>>(`${B}/tickets/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  team: () => request<SingleResponse<SupportStaff[]>>(`${B}/team`),
  addMember: (d: { email: string; full_name: string; role: string }) =>
    request<SingleResponse<{ id: string; email: string; role: string; temp_password: string }>>(`${B}/team`, { method: "POST", body: JSON.stringify(d) }),
  updateMember: (id: string, d: { role?: string; is_active?: boolean }) => request<SingleResponse<unknown>>(`${B}/team/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  settings: () => request<SingleResponse<SupportSettings>>(`${B}/settings`),
  saveSettings: (d: SupportSettings) => request<SingleResponse<SupportSettings>>(`${B}/settings`, { method: "PUT", body: JSON.stringify(d) }),
  channels: () => request<SingleResponse<SupportChannels>>(`${B}/channels`),
  whatsappConnect: () => request<SingleResponse<{ status: string }>>(`${B}/channels/whatsapp/connect`, { method: "POST" }),
  whatsappQr: () => request<SingleResponse<{ qr: string | null; status: string }>>(`${B}/channels/whatsapp/qr`),
  whatsappDisconnect: () => request<SingleResponse<{ status: string }>>(`${B}/channels/whatsapp/disconnect`, { method: "POST" }),
  emailSync: () => request<SingleResponse<{ imported: number }>>(`${B}/channels/email/sync`, { method: "POST" }),
};
