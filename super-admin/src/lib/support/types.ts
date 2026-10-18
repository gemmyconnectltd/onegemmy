// Customer Support module: typed models. DEMO PHASE — everything here is backed by in-browser sample data
// (see mockData.ts / service.ts). Nothing is sent, received or stored on Pesaa servers.

export type ChannelKind = "email" | "whatsapp";
export type ConversationStatus = "open" | "pending" | "resolved" | "snoozed";
export type Priority = "low" | "normal" | "high" | "urgent";
export type AgentAvailability = "online" | "away" | "offline";
export type PlanName = "Free" | "Starter" | "Professional" | "Enterprise";

/** A support channel and whether a real integration exists behind it (none do yet). */
export interface SupportChannel {
  kind: ChannelKind;
  label: string;
  connected: boolean;
  detail: string;
}

export interface Customer {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  country: string;
  industry: string;
  plan: PlanName;
  customerSince: string;
  tags: string[];
}

export interface Attachment {
  id: string;
  name: string;
  sizeBytes: number;
  mime: string;
  kind: "image" | "file";
  /** Object URL for a file picked in this browser session only. Never persisted. */
  previewUrl?: string;
}

export type MessageDirection = "inbound" | "outbound" | "note";
export type DeliveryState = "demo" | "sent" | "delivered" | "read" | "failed";

export interface SupportMessage {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  channel: ChannelKind;
  authorName: string;
  authorId?: string;
  body: string;
  subject?: string;
  sentAt: string;
  /** Outbound only. In this phase every outbound message is "demo": it was NOT delivered anywhere. */
  delivery?: DeliveryState;
  templateName?: string;
  attachments: Attachment[];
}

export interface ActivityEntry {
  id: string;
  at: string;
  text: string;
}

export interface SupportConversation {
  id: string;
  customerId: string;
  channel: ChannelKind;
  subject: string;
  status: ConversationStatus;
  priority: Priority;
  assigneeId: string | null;
  tags: string[];
  unread: number;
  snoozedUntil: string | null;
  createdAt: string;
  lastMessageAt: string;
  /** When the customer last wrote to us: drives the WhatsApp 24-hour customer-service window. */
  lastInboundAt: string | null;
  messages: SupportMessage[];
  activity: ActivityEntry[];
}

export interface SupportAgent {
  id: string;
  name: string;
  role: "Support lead" | "Support agent" | "Billing specialist";
  email: string;
  availability: AgentAvailability;
  languages: string[];
  color: string;
  isYou?: boolean;
}

export type EmailCategory = "General" | "Account" | "Billing" | "Technical";

export interface EmailTemplate {
  id: string;
  name: string;
  category: EmailCategory;
  subject: string;
  body: string;
  active: boolean;
  archived: boolean;
  updatedAt: string;
}

export type WhatsAppStatus = "draft" | "pending" | "approved" | "rejected";
export type WhatsAppCategory = "Utility" | "Marketing" | "Authentication";
export type WhatsAppLanguage = "en" | "fr" | "rw" | "sw";

export interface WhatsAppButton {
  type: "quick_reply" | "url";
  label: string;
  url?: string;
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  language: WhatsAppLanguage;
  category: WhatsAppCategory;
  /** Mock status only: no template here has been submitted to or approved by Meta. */
  status: WhatsAppStatus;
  header?: string;
  body: string;
  footer?: string;
  buttons: WhatsAppButton[];
  rejectionReason?: string;
  updatedAt: string;
}

export interface QuickReply {
  id: string;
  label: string;
  text: string;
}

export interface NewMessageDraft {
  id: string;
  channel: ChannelKind;
  customerId: string | null;
  subject: string;
  body: string;
  updatedAt: string;
}

export interface AssignmentRules {
  mode: "manual" | "round_robin" | "least_busy";
  maxOpenPerAgent: number;
  routeBillingToSpecialist: boolean;
  routeEnterpriseToLead: boolean;
  respectAvailability: boolean;
}

export interface BusinessHoursDay {
  day: string;
  open: boolean;
  from: string;
  to: string;
}

export interface SupportSettings {
  defaultPriority: Priority;
  defaultAssignment: "unassigned" | "rules";
  autoCloseDays: number | null;
  autoCloseMessage: string;
  businessHours: BusinessHoursDay[];
  timezone: string;
  notifyNewMessage: boolean;
  notifyUnassigned: boolean;
  notifyEmailDigest: "off" | "hourly" | "daily";
  signatureEmail: string;
  signatureWhatsApp: string;
}

export interface ConversationFilterState {
  query: string;
  channel: "all" | ChannelKind;
  status: "all" | ConversationStatus;
  assignee: "all" | "unassigned" | string;
  priority: "all" | Priority;
}

export interface AnalyticsPoint {
  label: string;
  email: number;
  whatsapp: number;
}

export interface AgentPerformance {
  agentId: string;
  name: string;
  handled: number;
  resolved: number;
  avgFirstResponseMin: number;
  avgResolutionHours: number;
  satisfaction: number | null;
}

export interface SupportAnalytics {
  totals: { total: number; open: number; resolved: number };
  firstResponseMin: number;
  resolutionHours: number;
  byChannel: { email: number; whatsapp: number };
  series: AnalyticsPoint[];
  agents: AgentPerformance[];
  /** Always null in the demo: there is no real customer feedback to average. */
  satisfaction: number | null;
}

export interface SupportState {
  customers: Customer[];
  agents: SupportAgent[];
  conversations: SupportConversation[];
  emailTemplates: EmailTemplate[];
  whatsappTemplates: WhatsAppTemplate[];
  quickReplies: QuickReply[];
  newMessageDrafts: NewMessageDraft[];
  replyDrafts: Record<string, string>;
  settings: SupportSettings;
  rules: AssignmentRules;
  channels: SupportChannel[];
}
