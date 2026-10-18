import { request, qs } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";

// Help & Support for a BUSINESS: its own tickets with Pesaa's support team (backend: /support/my/*). The server only
// ever returns tickets of the signed-in user's own business; internal staff notes are never included.

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export interface MyTicket {
  id: string; reference: string; subject: string; status: TicketStatus; priority: "low" | "normal" | "high" | "urgent";
  assigned_name: string | null; created_at: string; updated_at: string; resolved_at: string | null;
}
export interface MyTicketMessage {
  id: string; direction: "incoming" | "outgoing"; sender_name: string | null; body: string; created_at: string;
  attachments: { id: string; name: string; size: number | null; url: string }[];
}

const B = "/support/my";

export const supportApi = {
  list: (page = 1, pageSize = 20) => request<PaginatedResponse<MyTicket>>(`${B}/tickets${qs({ page, page_size: pageSize })}`),
  get: (id: string) => request<SingleResponse<{ ticket: MyTicket; messages: MyTicketMessage[] }>>(`${B}/tickets/${id}`),
  create: (d: { subject: string; description: string; priority: "low" | "normal" }) =>
    request<SingleResponse<MyTicket>>(`${B}/tickets`, { method: "POST", body: JSON.stringify(d) }),
  reply: (id: string, body: string) => request<SingleResponse<MyTicketMessage>>(`${B}/tickets/${id}/reply`, { method: "POST", body: JSON.stringify({ body }) }),
};
