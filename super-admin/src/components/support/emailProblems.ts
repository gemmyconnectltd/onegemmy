import type { Tone } from "@/components/ui/Badge";
import type { EmailProblem, EmailProblemReason } from "@/lib/api";

/** Why an email didn't arrive, in plain words, and what to do about it. One place, so the page and the overview agree. */
export const REASONS: Record<EmailProblemReason, { label: string; tone: Tone; what: (to: string) => string; next: string }> = {
  no_such_address: {
    label: "Address doesn't exist", tone: "red",
    what: (to) => `There is no mailbox at ${to}. It's almost always a typo made when signing up.`,
    next: "Call or WhatsApp them, ask for the right email and correct it below. They sign in with the corrected email.",
  },
  domain_not_found: {
    label: "Domain doesn't exist", tone: "red",
    what: (to) => `The part after the @ in ${to} doesn't receive email (for example gmial.com instead of gmail.com).`,
    next: "Get the right email from them and correct it below.",
  },
  mailbox_full: {
    label: "Mailbox full", tone: "amber",
    what: (to) => `The inbox at ${to} is full, so the email was turned away.`,
    next: "Ask them to free up space in their inbox, then send it again.",
  },
  blocked: {
    label: "Blocked", tone: "amber",
    what: (to) => `The mail server for ${to} refused it (spam filter or a company mail policy).`,
    next: "Ask them to allow email from pesaa.io, or give another address.",
  },
  not_sent: {
    label: "Not sent", tone: "amber",
    what: () => "Pesaa couldn't hand this email to the mail server (it was down, timed out or refused Pesaa's sign-in).",
    next: "This is usually on Pesaa's side and temporary. Send it again; if many fail together, check the email settings.",
  },
  other: {
    label: "Didn't arrive", tone: "slate",
    what: (to) => `The mail server for ${to} returned the email. Its exact words are below.`,
    next: "Contact them and confirm their email address.",
  },
};

export const REASON_ORDER: EmailProblemReason[] = ["no_such_address", "domain_not_found", "mailbox_full", "blocked", "not_sent", "other"];

const KINDS: Record<string, string> = {
  account_approved: "Account approved",
  registration_received: "Registration received",
  welcome: "Welcome email",
  password_reset: "Password reset link",
  invite: "Team invitation",
  temp_password: "New password",
  pending_signup: "New signup alert (to admins)",
  notice: "Account notice",
};

export const kindLabel = (p: Pick<EmailProblem, "kind" | "subject">) => (p.kind && KINDS[p.kind]) || p.subject || "Email";

/** Mails carrying a password or a sign-in link are never resent from a stored copy; the admin resets the password instead. */
export const hasSecret = (kind: string | null) => kind === "password_reset" || kind === "invite" || kind === "temp_password";

export const whatsappHref = (phone: string) => `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
