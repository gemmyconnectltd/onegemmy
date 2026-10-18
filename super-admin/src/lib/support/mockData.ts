// DEMO DATA ONLY. Every business, person, email and phone number below is fictional (".example" addresses and
// +250 788 000 xxx numbers); no real Pesaa customer appears here. Replaced by real API data in a later phase.
import { newId } from "./logic";
import type {
  ActivityEntry, Attachment, ChannelKind, ConversationStatus, Customer, EmailTemplate, MessageDirection, Priority,
  QuickReply, SupportAgent, SupportChannel, SupportConversation, SupportMessage, SupportSettings, SupportState,
  AssignmentRules, WhatsAppTemplate,
} from "./types";

const MIN = 60_000;

export function buildDemoState(now = Date.now()): SupportState {
  const at = (minutesAgo: number) => new Date(now - minutesAgo * MIN).toISOString();

  const customers: Customer[] = [
    { id: "cu-1", businessName: "Kigali Fresh Market", contactName: "Aline Uwase", email: "aline@kigalifresh.example", phone: "+250 788 000 101", country: "Rwanda", industry: "Supermarkets & Grocery", plan: "Professional", customerSince: at(60 * 24 * 220), tags: ["retail", "pos"] },
    { id: "cu-2", businessName: "Nile Pharmacy Group", contactName: "Moses Okello", email: "moses@nilepharmacy.example", phone: "+256 700 000 102", country: "Uganda", industry: "Pharmacies", plan: "Enterprise", customerSince: at(60 * 24 * 410), tags: ["multi-branch", "vip"] },
    { id: "cu-3", businessName: "Savanna Hardware", contactName: "Wanjiru Kamau", email: "wanjiru@savannahardware.example", phone: "+254 700 000 103", country: "Kenya", industry: "Hardware Stores", plan: "Starter", customerSince: at(60 * 24 * 95), tags: ["upgrade-lead"] },
    { id: "cu-4", businessName: "Lakeside Boutique", contactName: "Divine Ingabire", email: "divine@lakesideboutique.example", phone: "+250 788 000 104", country: "Rwanda", industry: "Clothing & Fashion", plan: "Free", customerSince: at(60 * 24 * 40), tags: [] },
    { id: "cu-5", businessName: "Harvest Bakery & Café", contactName: "Neema Mushi", email: "neema@harvestbakery.example", phone: "+255 700 000 105", country: "Tanzania", industry: "Bakeries", plan: "Starter", customerSince: at(60 * 24 * 12), tags: ["new-signup"] },
    { id: "cu-6", businessName: "Mount Kenya Auto Parts", contactName: "Peter Mwangi", email: "peter@mkautoparts.example", phone: "+254 700 000 106", country: "Kenya", industry: "Auto Repair & Parts", plan: "Professional", customerSince: at(60 * 24 * 150), tags: ["inventory"] },
    { id: "cu-7", businessName: "Bugesera Wholesale", contactName: "Claude Niyonzima", email: "claude@bugesera.example", phone: "+250 788 000 107", country: "Rwanda", industry: "Wholesale", plan: "Professional", customerSince: at(60 * 24 * 300), tags: ["multi-currency"] },
    { id: "cu-8", businessName: "Zanzibar Tailors", contactName: "Fatma Juma", email: "fatma@zanzibartailors.example", phone: "+255 700 000 108", country: "Tanzania", industry: "Tailoring", plan: "Free", customerSince: at(60 * 24 * 6), tags: ["new-signup"] },
  ];

  const agents: SupportAgent[] = [
    { id: "ag-you", name: "You (demo admin)", role: "Support lead", email: "you@pesaa.example", availability: "online", languages: ["English", "Kinyarwanda"], color: "#16a34a", isYou: true },
    { id: "ag-1", name: "Grace Mukamana", role: "Support agent", email: "grace@pesaa.example", availability: "online", languages: ["English", "Kinyarwanda", "French"], color: "#0284c7" },
    { id: "ag-2", name: "Eric Habimana", role: "Support agent", email: "eric@pesaa.example", availability: "away", languages: ["English", "Kinyarwanda"], color: "#8b5cf6" },
    { id: "ag-3", name: "Sandra Achieng", role: "Billing specialist", email: "sandra@pesaa.example", availability: "online", languages: ["English", "Swahili"], color: "#d97706" },
    { id: "ag-4", name: "David Okello", role: "Support agent", email: "david@pesaa.example", availability: "offline", languages: ["English", "Swahili"], color: "#ef4444" },
  ];
  const agentName = (id: string | null) => agents.find((a) => a.id === id)?.name ?? "Support";
  const custName = (id: string) => customers.find((c) => c.id === id)?.contactName ?? "Customer";

  type M = [MessageDirection, number, string, { by?: string; attach?: Attachment[]; template?: string }?];
  const conv = (
    id: string, customerId: string, channel: ChannelKind, subject: string, status: ConversationStatus, priority: Priority,
    assigneeId: string | null, tags: string[], unread: number, msgs: M[], activity: [number, string][] = [],
  ): SupportConversation => {
    const messages: SupportMessage[] = msgs.map(([direction, ago, body, x], i) => ({
      id: `${id}-m${i + 1}`, conversationId: id, direction, channel,
      authorName: direction === "inbound" ? custName(customerId) : agentName(x?.by ?? assigneeId ?? "ag-you"),
      authorId: direction === "inbound" ? undefined : (x?.by ?? assigneeId ?? "ag-you"),
      body, subject: channel === "email" ? (i === 0 ? subject : `Re: ${subject}`) : undefined, sentAt: at(ago),
      delivery: direction === "outbound" ? "read" : undefined, templateName: x?.template, attachments: x?.attach ?? [],
    }));
    const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");
    const acts: ActivityEntry[] = [
      { id: `${id}-a0`, at: messages[0].sentAt, text: `Conversation started via ${channel === "email" ? "email" : "WhatsApp"}` },
      ...activity.map(([ago, text], i) => ({ id: `${id}-a${i + 1}`, at: at(ago), text })),
    ];
    return {
      id, customerId, channel, subject, status, priority, assigneeId, tags, unread, snoozedUntil: null,
      createdAt: messages[0].sentAt, lastMessageAt: messages[messages.length - 1].sentAt, lastInboundAt: lastInbound?.sentAt ?? null,
      messages, activity: acts,
    };
  };
  const img = (name: string, kb: number): Attachment => ({ id: newId("att"), name, sizeBytes: kb * 1024, mime: "image/jpeg", kind: "image" });
  const file = (name: string, kb: number, mime = "application/pdf"): Attachment => ({ id: newId("att"), name, sizeBytes: kb * 1024, mime, kind: "file" });

  const conversations: SupportConversation[] = [
    conv("cv-1", "cu-1", "whatsapp", "POS not syncing after the power cut", "open", "high", "ag-1", ["pos", "sync"], 1, [
      ["inbound", 22, "Hello, our POS tablet has said \"offline\" since the power cut this morning. Sales are piling up."],
      ["outbound", 18, "Hi Aline, sorry about that! Please keep the app open for a few minutes. Queued sales sync on their own once the connection is back. What does the sync badge show?", { by: "ag-1" }],
      ["inbound", 6, "It says 14 sales waiting. The Wi-Fi is back now."],
    ], [[18, "Assigned to Grace Mukamana"], [18, "Priority set to High"]]),
    conv("cv-2", "cu-2", "email", "VAT on invoices looks wrong for exempt items", "pending", "normal", "ag-2", ["billing", "vat"], 0, [
      ["inbound", 60 * 26, "Hi team,\n\nSeveral invoices we issued yesterday show 18% VAT on products that are VAT-exempt. Could you check how exempt items are configured? Screenshot attached."],
      ["outbound", 60 * 22, "Hello Moses,\n\nThanks for the screenshot. Pesaa prices are VAT-inclusive by default, so exempt products must be marked in **Inventory → Product → Tax**. Could you confirm which three products are affected?", { by: "ag-2" }],
      ["note", 60 * 21, "Checked their tenant (demo): 3 products have the default tax class. Waiting for the customer to confirm before changing anything.", { by: "ag-2" }],
    ], [[60 * 22, "Status set to Pending"]]),
    conv("cv-3", "cu-3", "whatsapp", "Upgrading to Professional", "open", "normal", null, ["upgrade-lead"], 1, [
      ["inbound", 60 * 74, "Good afternoon. We have two shops now. Is the Professional plan the right one, and can I keep my data?", { attach: [img("shop-front.jpg", 412)] }],
    ]),
    conv("cv-4", "cu-4", "email", "I can't reset my password", "open", "urgent", null, ["account"], 1, [
      ["inbound", 35, "Hello, I click \"Forgot password\" but the email never arrives. I need to sign in to close my till tonight. Please help!"],
    ]),
    conv("cv-5", "cu-5", "email", "Exporting the stock report to Excel", "resolved", "low", "ag-3", ["how-to"], 0, [
      ["inbound", 60 * 52, "Where can I download my stock report as an Excel file?"],
      ["outbound", 60 * 50, "Hi Neema, open **Inventory → Reports**, choose the stock valuation report and use **Export → Excel**. Here is the guide:\n\n- Pick the branch\n- Choose the date\n- Click Export", { by: "ag-3" }],
      ["inbound", 60 * 49, "Found it, thank you!"],
    ], [[60 * 49, "Marked as resolved"]]),
    conv("cv-6", "cu-6", "whatsapp", "Branch stock transfer stuck in \"In transit\"", "pending", "high", "ag-2", ["inventory", "transfer"], 0, [
      ["inbound", 60 * 5, "The transfer to our Nakuru branch has been In transit for two days but the goods arrived."],
      ["outbound", 60 * 4, "Hi Peter, the receiving branch must press **Receive** on the transfer before the stock moves. Can someone at Nakuru do that? I can walk them through it.", { by: "ag-2" }],
    ], [[60 * 4, "Status set to Pending"]]),
    conv("cv-7", "cu-7", "email", "USD rate missing for a supplier bill", "open", "high", "ag-4", ["multi-currency"], 1, [
      ["inbound", 60 * 2, "When I create a supplier bill in USD, I get a message that no exchange rate is set. What should I do?"],
      ["note", 60 * 1, "Their platform has no USD→RWF rate for this month. Suggest adding a rate in Settings → Exchange rates, then retry.", { by: "ag-4" }],
    ]),
    conv("cv-8", "cu-8", "whatsapp", "How do I add my first product?", "resolved", "low", "ag-1", ["onboarding"], 0, [
      ["outbound", 60 * 30, "Welcome to Pesaa, Fatma! Reply here if you need help getting started.", { by: "ag-1", template: "welcome_new_business" }],
      ["inbound", 60 * 29, "How do I add my first product?"],
      ["outbound", 60 * 29, "Go to **Inventory → Products → New product**. Add a name, the selling price and the quantity you have.", { by: "ag-1" }],
      ["inbound", 60 * 28, "Done, thank you 🙏"],
    ], [[60 * 28, "Marked as resolved"]]),
    conv("cv-9", "cu-1", "email", "Invoice for last month's subscription", "resolved", "normal", "ag-3", ["billing"], 0, [
      ["inbound", 60 * 96, "Please resend our subscription invoice for last month."],
      ["outbound", 60 * 95, "Hello Aline, the invoice is attached.", { by: "ag-3", attach: [file("pesaa-invoice-demo.pdf", 88)] }],
    ], [[60 * 94, "Marked as resolved"]]),
    conv("cv-10", "cu-2", "whatsapp", "Barcode scanner doesn't add items", "open", "normal", "ag-1", ["pos", "hardware"], 1, [
      ["inbound", 50, "Our new scanner beeps but nothing is added to the cart."],
    ]),
    conv("cv-11", "cu-3", "email", "Feature request: purchase order approvals", "pending", "low", "ag-you", ["feature-request"], 0, [
      ["inbound", 60 * 70, "It would help if a manager had to approve purchase orders over a certain amount. Is that planned?"],
      ["outbound", 60 * 68, "Hi Wanjiru, thanks for the suggestion. I've logged it with the product team and will tell you if it is scheduled.", { by: "ag-you" }],
    ]),
    conv("cv-12", "cu-6", "email", "Employee leave balance question", "open", "low", null, ["hr"], 1, [
      ["inbound", 60 * 9, "How is the annual leave balance calculated for staff who joined mid-year?"],
    ]),
    conv("cv-13", "cu-4", "whatsapp", "Help with the end-of-day report", "pending", "normal", "ag-4", ["reports"], 0, [
      ["inbound", 60 * 28, "Where do I see how much cash I should have in the till?"],
      ["outbound", 60 * 27, "Open **Reports → Sales** and pick today's date. The payment methods are split into cash, mobile money and card.", { by: "ag-4" }],
    ], [[60 * 27, "Status set to Pending"]]),
    conv("cv-14", "cu-5", "email", "Our account approval is taking long", "open", "high", null, ["approval"], 1, [
      ["inbound", 60 * 3, "We registered two days ago but cannot sign in yet. When will the account be approved?"],
    ]),
  ];

  const emailTemplates: EmailTemplate[] = [
    { id: "et-1", name: "Welcome to Pesaa", category: "Account", subject: "Welcome to Pesaa, {{customer_name}}", body: "Hello {{customer_name}},\n\nWelcome to Pesaa! Your business **{{business_name}}** is ready on the **{{plan_name}}** plan.\n\nA good first week:\n- Add your products\n- Invite your team\n- Make your first sale\n\nReply to this email any time. We're here to help.\n\n{{support_agent}}\nPesaa Support", active: true, archived: false, updatedAt: at(60 * 24 * 12) },
    { id: "et-2", name: "Account approved", category: "Account", subject: "Your Pesaa account is approved", body: "Hello {{customer_name}},\n\nGood news: **{{business_name}}** has been approved. You can now sign in and start using Pesaa.\n\n[Sign in to Pesaa](https://app.pesaa.example/login)\n\n{{support_agent}}", active: true, archived: false, updatedAt: at(60 * 24 * 9) },
    { id: "et-3", name: "Password reset help", category: "Account", subject: "Help signing in to Pesaa", body: "Hello {{customer_name}},\n\nIf the reset email didn't arrive:\n1. Check your spam folder\n2. Make sure you typed the email address you registered with\n3. Try again in a few minutes\n\nIf it still doesn't arrive, reply here and we will help you directly.\n\n{{support_agent}}", active: true, archived: false, updatedAt: at(60 * 24 * 20) },
    { id: "et-4", name: "Invoice copy", category: "Billing", subject: "Your Pesaa invoice for {{business_name}}", body: "Hello {{customer_name}},\n\nYour invoice is attached. If anything looks wrong, reply to this email and our billing team will review it.\n\n{{support_agent}}", active: true, archived: false, updatedAt: at(60 * 24 * 31) },
    { id: "et-5", name: "Plan upgrade options", category: "Billing", subject: "Upgrading from {{plan_name}}", body: "Hello {{customer_name}},\n\nThanks for your interest in upgrading. Higher plans add more users, branches and modules, and your data stays exactly as it is.\n\nWould you like a short call to walk through the options?\n\n{{support_agent}}", active: true, archived: false, updatedAt: at(60 * 24 * 14) },
    { id: "et-6", name: "Service disruption notice", category: "Technical", subject: "We're investigating an issue", body: "Hello {{customer_name}},\n\nWe're aware of an issue affecting some users and are working on it. Your data is safe, and we'll update you by {{current_date}}.\n\n{{support_agent}}", active: false, archived: false, updatedAt: at(60 * 24 * 60) },
    { id: "et-7", name: "POS offline sync how-to", category: "Technical", subject: "How offline sales sync", body: "Hello {{customer_name}},\n\nWhen the connection drops the POS keeps working and **queues sales on the device**. They sync automatically when you're back online. Keep the app open until the queue shows 0.\n\n{{support_agent}}", active: true, archived: false, updatedAt: at(60 * 24 * 7) },
    { id: "et-8", name: "Closing a resolved request", category: "General", subject: "Re: your request", body: "Hello {{customer_name}},\n\nWe're closing this request because it looks resolved. If you need anything else, just reply and we'll reopen it.\n\n{{support_agent}}", active: true, archived: false, updatedAt: at(60 * 24 * 3) },
  ];

  const whatsappTemplates: WhatsAppTemplate[] = [
    { id: "wt-1", name: "welcome_new_business", language: "en", category: "Utility", status: "approved", header: "Welcome to Pesaa", body: "Hello {{1}}, welcome to Pesaa! Your business {{2}} is ready. Reply here if you need help getting started.", footer: "Pesaa Support", buttons: [{ type: "quick_reply", label: "I need help" }], updatedAt: at(60 * 24 * 30) },
    { id: "wt-2", name: "account_approved", language: "en", category: "Utility", status: "approved", body: "Good news {{1}}: {{2}} has been approved on Pesaa. You can sign in now.", buttons: [{ type: "url", label: "Sign in", url: "https://app.pesaa.example/login" }], updatedAt: at(60 * 24 * 28) },
    { id: "wt-3", name: "payment_reminder", language: "en", category: "Utility", status: "pending", body: "Hello {{1}}, your Pesaa subscription of {{2}} is due on {{3}}.", footer: "Reply STOP to opt out", buttons: [], updatedAt: at(60 * 24 * 2) },
    { id: "wt-4", name: "feature_announcement", language: "en", category: "Marketing", status: "rejected", body: "🔥 Big sale! Upgrade to Pesaa now and get 90% off!!!", buttons: [], rejectionReason: "Promotional wording and excessive punctuation. Rewrite as a clear, factual announcement.", updatedAt: at(60 * 24 * 5) },
    { id: "wt-5", name: "support_follow_up_fr", language: "fr", category: "Utility", status: "draft", body: "Bonjour {{1}}, nous voulons savoir si votre demande a bien été résolue.", buttons: [{ type: "quick_reply", label: "Oui" }, { type: "quick_reply", label: "Pas encore" }], updatedAt: at(60 * 24) },
    { id: "wt-6", name: "ikaze_pesaa", language: "rw", category: "Utility", status: "approved", body: "Muraho {{1}}, murakaza neza kuri Pesaa! Twandikire niba mukeneye ubufasha.", buttons: [], updatedAt: at(60 * 24 * 40) },
    { id: "wt-7", name: "login_code", language: "en", category: "Authentication", status: "draft", body: "{{1}} is your Pesaa verification code. It expires in 10 minutes.", buttons: [], updatedAt: at(60 * 3) },
  ];

  const quickReplies: QuickReply[] = [
    { id: "qr-1", label: "Greeting", text: "Hello, thanks for contacting Pesaa Support. I'm happy to help." },
    { id: "qr-2", label: "Need more details", text: "Could you share a screenshot and tell me what you expected to happen? That will help me find the cause quickly." },
    { id: "qr-3", label: "Checking now", text: "Thanks for waiting. I'm checking this now and will come back to you shortly." },
    { id: "qr-4", label: "Sync reassurance", text: "Your sales are safe on the device. They sync automatically once the connection returns." },
    { id: "qr-5", label: "Escalating", text: "I've passed this to our specialist team and will update you as soon as I hear back." },
    { id: "qr-6", label: "Closing", text: "Glad I could help! If you need anything else, just reply here." },
  ];

  const settings: SupportSettings = {
    defaultPriority: "normal", defaultAssignment: "rules", autoCloseDays: 7,
    autoCloseMessage: "We're closing this conversation because we haven't heard back. Reply any time to reopen it.",
    businessHours: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, i) => ({ day, open: i < 5, from: "08:00", to: i === 4 ? "16:00" : "17:00" })),
    timezone: "Africa/Kigali", notifyNewMessage: true, notifyUnassigned: true, notifyEmailDigest: "daily",
    signatureEmail: "Best regards,\n{{support_agent}}\nPesaa Support", signatureWhatsApp: "— Pesaa Support",
  };
  const rules: AssignmentRules = { mode: "round_robin", maxOpenPerAgent: 12, routeBillingToSpecialist: true, routeEnterpriseToLead: true, respectAvailability: true };
  const channels: SupportChannel[] = [
    { kind: "email", label: "Email", connected: false, detail: "No mailbox is connected yet. Messages in this demo are not sent or received." },
    { kind: "whatsapp", label: "WhatsApp Business", connected: false, detail: "The WhatsApp Business Cloud API isn't connected yet. Template statuses shown here are mock data." },
  ];

  return { customers, agents, conversations, emailTemplates, whatsappTemplates, quickReplies, newMessageDrafts: [], replyDrafts: {}, settings, rules, channels };
}
