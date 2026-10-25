import { request, qs, API_BASE, getStoredToken } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";

// Marketing Hub (backend: /admin/marketing/*). Platform-admin only; the server re-checks every call.

export type ConsentMode = "opt_out" | "opt_in";
export type ContactStatus = "active" | "unsubscribed" | "bounced" | "complained" | "invalid";
export interface ContactFilters {
  q?: string; countries?: string[]; plans?: string[]; industries?: string[]; sources?: string[]; tags?: string[];
  account_status?: "active" | "suspended"; preferred_contact?: "email" | "phone" | "whatsapp"; consent?: "subscribed" | "unknown";
  newsletter?: boolean; status?: ContactStatus; activity?: "active_30d" | "inactive_30d" | "never"; registered_from?: string; registered_to?: string;
}
export interface Contact {
  id: string; email: string; name: string | null; business_name: string | null; tenant_id: string | null; phone: string | null; country: string | null;
  source: "tenant" | "import" | "manual"; status: ContactStatus; status_reason: string | null; consent: "subscribed" | "unknown"; consent_source: string | null;
  consent_at: string | null; newsletter_subscribed: boolean; tags: string[]; email_valid: boolean; invalid_reason: string | null; eligible: boolean; created_at: string;
  plan: string | null; industry: string | null; account_active: boolean | null; preferred_contact: string | null; registered_at: string; last_active_at: string | null;
}
export interface ContactProfile {
  contact: Contact;
  business: { id: string; name: string; plan: string; country: string | null; city: string | null; industry: string | null; is_active: boolean; preferred_contact: string; phone: string | null; created_at: string } | null;
  messages: { id: string; title: string; kind: "campaign" | "automation"; status: string; reason: string | null; sentAt: string | null; queuedAt: string; opens: number; clicks: number; unsubscribedAt: string | null }[];
  supportOutreach: { id: string; channel: string; subject: string | null; at: string | null }[];
  activity: { at: string; by: string | null; action: string; summary: string }[];
}
export interface AudienceSummary {
  matched: number; eligible: number; consentMode: ConsentMode;
  excluded: { unsubscribed: number; bounced_or_complained: number; invalid_email: number; suspended_account: number; no_consent: number; not_newsletter_subscriber: number };
}
export interface Segment { id: string; name: string; description: string | null; filters: ContactFilters; matched: number; eligible: number }
export interface ImportResult { rows: number; new: number; invalid: number; duplicate_in_file: number; already_exists: number; suppressed: number; problems: { row: number; email: string; reason: string }[]; dryRun: boolean }
export type BulkAction = "add_tags" | "remove_tags" | "consent" | "newsletter_on" | "newsletter_off" | "suppress" | "reactivate" | "delete";

export type BlockType = "header" | "heading" | "paragraph" | "image" | "button" | "divider" | "spacer" | "columns" | "social" | "footer";
export interface EmailBlock { id: string; type: BlockType; props: Record<string, unknown> }
export interface Template { id: string; name: string; category: string; description: string | null; subject: string | null; preheader: string | null; status: "active" | "archived"; is_system: boolean; blocks: EmailBlock[]; created_at: string; updated_at: string }

export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "paused" | "cancelled" | "failed" | "active";
export interface CampaignStats { sent?: number; failed?: number; bounced?: number; opened?: number; clicked?: number; unsubscribed?: number; openRate?: number | null; clickRate?: number | null }
export interface Campaign extends CampaignStats {
  id: string; kind: "campaign" | "newsletter" | "issue"; parent_id: string | null; name: string; campaign_type: string; subject: string; preheader: string | null;
  sender_name: string | null; sender_email: string | null; reply_to: string | null; template_id: string | null; status: CampaignStatus; scheduled_at: string | null;
  started_at: string | null; completed_at: string | null; recipient_count: number; created_at: string; updated_at: string; blocks: EmailBlock[];
  audience: { segment_id?: string | null; filters?: ContactFilters }; schedule: NewsletterSchedule | null;
}
export interface NewsletterSchedule { frequency: "weekly" | "biweekly" | "monthly"; weekday?: number; day?: number; hour: number; next_run_at?: string | null }
export interface Readiness {
  checks: { key: string; label: string; ok: boolean; blocking: boolean; detail: string | null }[]; canSend: boolean; audience: AudienceSummary; sender: string;
}
export interface CampaignResults {
  total: number; queued: number; sent: number; failed: number; bounced: number; skipped: number; uniqueOpens: number; uniqueClicks: number; unsubscribed: number; clickEvents: number;
  openRate: number | null; clickRate: number | null; bounceRate: number | null; unsubscribeRate: number | null; topLinks: { url: string; clicks: number }[];
}
export interface Recipient { id: string; contact: string; email: string; status: string; reason: string | null; sentAt: string | null; opens: number; clicks: number; unsubscribed: boolean }

export interface Automation {
  id: string; name: string; kind: "welcome" | "onboarding" | "announcement" | "renewal" | "reengagement"; trigger: string; delay_hours: number; template_id: string | null;
  subject: string; preheader: string | null; active: boolean; activated_at: string | null; last_run_at: string | null; created_at: string; params: Record<string, number>;
  blocks: EmailBlock[]; triggerText: string; stats: { total: number; sent: number; queued: number; failed: number; skipped: number; opened: number; clicked: number; unsubscribed: number };
}
export interface AutomationKind { kind: string; label: string; trigger: string; params: Record<string, number> }
export interface AutomationRun { id: string; contact: string; email: string; status: string; reason: string | null; queuedAt: string; sentAt: string | null; opens: number; clicks: number }

export interface MarketingOverview {
  period: { from: string; to: string; days: number; previousFrom: string; previousTo: string }; groupBy: string; consentMode: ConsentMode;
  kpis: {
    eligibleContacts: { value: number }; newsletterSubscribers: { value: number };
    campaignsSent: { value: number; previous: number; changePct: number | null };
    engagementRate: { value: number | null; previous: number | null; changePct: number | null; sent: number };
  };
  growth: { period: string; new: number; total: number }[];
  recent: (CampaignStats & { id: string; name: string; kind: string; status: CampaignStatus; scheduledAt: string | null; startedAt: string | null; recipients: number })[];
}
export interface MarketingAnalytics {
  period: MarketingOverview["period"]; groupBy: string;
  totals: { sent: number; failed: number; bounced: number; opened: number; clicked: number; unsubscribed: number; uniqueOpens: number; uniqueClicks: number; openRate: number | null; clickRate: number | null; complaints: number; acceptanceRate: number | null; previous: Record<string, number> };
  series: { period: string; sent: number; opens: number; clicks: number; unsubscribes: number }[];
  subscriberGrowth: { period: string; subscribers: number; joined: number; left: number }[];
  campaigns: (CampaignStats & { id: string; name: string; kind: string; startedAt: string; recipients: number; signups: number; paying: number })[];
  health: { key: string; label: string; value: number | null; status: "good" | "warn" | "bad" | "unknown" }[];
  limits: { delivered: string; opens: string; clicks: string };
}
export interface MarketingSettings {
  general: { sender_name: string; sender_email: string; reply_to: string };
  brand: { color: string; logo_url: string; company: string; address: string };
  compliance: { consent_mode: ConsentMode; footer_note: string; require_address: boolean };
  provider: { kind: string; host: string; port: number; account: string; configured: boolean; from: string; dedicated: boolean };
  safeMode: { active: boolean; allowedRecipients: number; environment: string };
}
export interface DomainStatus { domain: string; spf: { status: string; record?: string | null }; dkim: { status: string; selector?: string | null; note?: string | null }; dmarc: { status: string; record?: string | null } }
export interface Suppression { id: string; email: string; business_name: string | null; status: string; reason: string | null; at: string | null; source: string }
export interface AuditEntry { id: string; at: string; by: string | null; action: string; summary: string }

const B = "/admin/marketing";
type Q = Record<string, string | number | undefined>;
const body = (data: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(data) });
const filterQs = (f: ContactFilters): string => {
  const p = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => {
    if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) return;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x)); else p.set(k, String(v));
  });
  return p.toString();
};
const join = (a: string, b: string) => (a && b ? `${a}&${b}` : a || b);

export const marketingApi = {
  overview: (q: Q) => request<SingleResponse<MarketingOverview>>(`${B}/overview${qs(q)}`),
  analytics: (q: Q) => request<SingleResponse<MarketingAnalytics>>(`${B}/analytics${qs(q)}`),
  contacts: (page: number, pageSize: number, f: ContactFilters, sort: string, dir: string) =>
    request<PaginatedResponse<Contact>>(`${B}/contacts?${join(filterQs(f), new URLSearchParams({ page: String(page), page_size: String(pageSize), sort, dir }).toString())}`),
  contactOptions: () => request<SingleResponse<{ countries: string[]; plans: string[]; industries: string[]; tags: string[] }>>(`${B}/contacts/options`),
  summary: (f: ContactFilters, newsletter = false) => request<SingleResponse<AudienceSummary>>(`${B}/contacts/summary${qs({ newsletter: newsletter ? "true" : undefined })}`, body(f)),
  contact: (id: string) => request<SingleResponse<ContactProfile>>(`${B}/contacts/${id}`),
  addContact: (d: { email: string; name?: string; business_name?: string; phone?: string; country?: string; tags: string[]; consent_source: string }) => request<SingleResponse<{ id: string }>>(`${B}/contacts`, body(d)),
  editContact: (id: string, d: { name?: string; tags?: string[] }) => request<SingleResponse<null>>(`${B}/contacts/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  bulk: (d: { ids?: string[]; filters?: ContactFilters; all_matching?: boolean; action: BulkAction; tags?: string[]; consent_source?: string; reason?: string }) => request<SingleResponse<{ changed: number; selected: number }>>(`${B}/contacts/bulk`, body(d)),
  importContacts: (d: { csv: string; consent_source: string; tags: string[]; dry_run: boolean; confirm_permission: boolean }) => request<SingleResponse<ImportResult>>(`${B}/contacts/import`, body(d)),
  segments: () => request<SingleResponse<Segment[]>>(`${B}/segments`),
  saveSegment: (id: string | null, d: { name: string; description?: string; filters: ContactFilters }) => request<SingleResponse<{ id?: string }>>(id ? `${B}/segments/${id}` : `${B}/segments`, { method: id ? "PUT" : "POST", body: JSON.stringify(d) }),
  deleteSegment: (id: string) => request<SingleResponse<null>>(`${B}/segments/${id}`, { method: "DELETE" }),

  templates: (q: { q?: string; category?: string; status?: string }) => request<SingleResponse<Template[]>>(`${B}/templates${qs(q)}`),
  template: (id: string) => request<SingleResponse<Template>>(`${B}/templates/${id}`),
  createTemplate: (d: Partial<Template>) => request<SingleResponse<Template>>(`${B}/templates`, body(d)),
  updateTemplate: (id: string, d: Partial<Template>) => request<SingleResponse<Template>>(`${B}/templates/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  templateAction: (id: string, a: "duplicate" | "archive" | "restore") => request<SingleResponse<Template | null>>(`${B}/templates/${id}/${a}`, { method: "POST" }),
  render: (d: { blocks: EmailBlock[]; subject: string; preheader: string }) => request<SingleResponse<{ html: string; text: string; subject: string }>>(`${B}/render`, body(d)),
  uploadImage: async (file: File): Promise<string> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_BASE}${B}/uploads`, { method: "POST", body: form, headers: { Authorization: `Bearer ${getStoredToken() ?? ""}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, detail: json.detail || json.message || "Upload failed" };
    return json.data.url as string;
  },

  campaigns: (q: { kind?: string; status?: string; q?: string; parent_id?: string; page?: number; page_size?: number }) => request<PaginatedResponse<Campaign>>(`${B}/campaigns${qs(q)}`),
  campaign: (id: string) => request<SingleResponse<Campaign>>(`${B}/campaigns/${id}`),
  createCampaign: (d: Partial<Campaign> & { kind?: "campaign" | "newsletter" }) => request<SingleResponse<Campaign>>(`${B}/campaigns`, body(d)),
  updateCampaign: (id: string, d: Partial<Campaign>) => request<SingleResponse<Campaign>>(`${B}/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  duplicateCampaign: (id: string) => request<SingleResponse<Campaign>>(`${B}/campaigns/${id}/duplicate`, { method: "POST" }),
  readiness: (id: string) => request<SingleResponse<Readiness>>(`${B}/campaigns/${id}/readiness`),
  sendCampaign: (id: string, confirm_recipients: number) => request<SingleResponse<Campaign>>(`${B}/campaigns/${id}/send`, body({ confirm_recipients })),
  scheduleCampaign: (id: string, at: string, confirm_recipients: number) => request<SingleResponse<Campaign>>(`${B}/campaigns/${id}/schedule`, body({ at, confirm_recipients })),
  campaignAction: (id: string, a: "unschedule" | "pause" | "resume" | "cancel" | "activate") => request<SingleResponse<Campaign>>(`${B}/campaigns/${id}/${a}`, { method: "POST" }),
  publishIssue: (id: string, confirm_recipients: number) => request<SingleResponse<Campaign>>(`${B}/campaigns/${id}/publish-issue`, body({ confirm_recipients })),
  testCampaign: (id: string, to: string) => request<SingleResponse<null>>(`${B}/campaigns/${id}/test`, body({ to })),
  results: (id: string) => request<SingleResponse<CampaignResults>>(`${B}/campaigns/${id}/results`),
  recipients: (id: string, q: { status?: string; page?: number; page_size?: number }) => request<PaginatedResponse<Recipient>>(`${B}/campaigns/${id}/recipients${qs(q)}`),

  automations: () => request<SingleResponse<{ items: Automation[]; kinds: AutomationKind[] }>>(`${B}/automations`),
  createAutomation: (d: Partial<Omit<Automation, "kind">> & { kind: string }) => request<SingleResponse<Automation>>(`${B}/automations`, body(d)),
  updateAutomation: (id: string, d: Partial<Automation>) => request<SingleResponse<Automation>>(`${B}/automations/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  automationAction: (id: string, a: "activate" | "pause" | "run") => request<SingleResponse<Automation | { queued: number }>>(`${B}/automations/${id}/${a}`, { method: "POST" }),
  deleteAutomation: (id: string) => request<SingleResponse<null>>(`${B}/automations/${id}`, { method: "DELETE" }),
  automationHistory: (id: string) => request<SingleResponse<AutomationRun[]>>(`${B}/automations/${id}/history`),

  settings: () => request<SingleResponse<MarketingSettings>>(`${B}/settings`),
  saveSettings: (section: "general" | "brand" | "compliance", values: Record<string, unknown>) => request<SingleResponse<Record<string, unknown>>>(`${B}/settings/${section}`, { method: "PUT", body: JSON.stringify({ values }) }),
  domain: (domain?: string) => request<SingleResponse<DomainStatus>>(`${B}/settings/domain${qs({ domain })}`),
  testConnection: () => request<SingleResponse<{ ok: boolean; error: string | null }>>(`${B}/settings/test-connection`, { method: "POST" }),
  testSend: (to: string) => request<SingleResponse<null>>(`${B}/settings/test-send`, body({ to })),
  suppressions: (q: { q?: string; page?: number; page_size?: number }) => request<PaginatedResponse<Suppression>>(`${B}/settings/suppressions${qs(q)}`),
  audit: (q: { page?: number; page_size?: number }) => request<PaginatedResponse<AuditEntry>>(`${B}/settings/audit${qs(q)}`),
};
