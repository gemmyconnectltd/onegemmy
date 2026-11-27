import { request, qs } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";

/** An email Pesaa sent that never reached the person: refused while sending, or bounced back later. */
export type EmailProblemReason = "no_such_address" | "domain_not_found" | "mailbox_full" | "blocked" | "not_sent" | "other";

export interface EmailProblem {
  id: string;
  recipient: string;
  subject: string | null;
  kind: string | null;
  source: "send" | "bounce";
  reason: EmailProblemReason;
  detail: string | null;
  smtp_code: string | null;
  occurred_at: string;
  status: "open" | "resolved";
  resolved_at: string | null;
  resolution: string | null;
  can_resend: boolean;
  user: { id: string; full_name: string; email: string; phone: string | null; role: string } | null;
  tenant: { id: string; name: string; phone: string | null; email: string | null; is_active: boolean; subscription_status: string } | null;
}

export interface EmailProblemSummary {
  open: number;
  by_reason: Partial<Record<EmailProblemReason, number>>;
  resolved_last_7_days: number;
  check: { enabled: boolean; host: string | null; last_checked_at: string | null; last_error: string | null; mailboxes: number };
}

export interface EmailProblemFilters { status?: "open" | "resolved" | "all"; reason?: EmailProblemReason; q?: string }

const B = "/admin/email-problems";

export const emailProblemsApi = {
  list: (page: number, pageSize: number, f: EmailProblemFilters) =>
    request<PaginatedResponse<EmailProblem>>(`${B}${qs({ page, page_size: pageSize, status: f.status, reason: f.reason, q: f.q })}`),
  summary: () => request<SingleResponse<EmailProblemSummary>>(`${B}/summary`),
  check: () => request<SingleResponse<{ added: number }>>(`${B}/check`, { method: "POST" }),
  resolve: (id: string, note: string) => request<SingleResponse<unknown>>(`${B}/${id}/resolve`, { method: "POST", body: JSON.stringify({ note }) }),
  reopen: (id: string) => request<SingleResponse<unknown>>(`${B}/${id}/reopen`, { method: "POST" }),
  resend: (id: string) => request<SingleResponse<unknown>>(`${B}/${id}/resend`, { method: "POST" }),
  correctEmail: (id: string, body: { email: string; resend: boolean; note: string }) =>
    request<SingleResponse<{ email: string; resent: boolean }>>(`${B}/${id}/correct-email`, { method: "POST", body: JSON.stringify(body) }),
};
