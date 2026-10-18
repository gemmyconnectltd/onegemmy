import { Mail, MessageCircle, Phone } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/Badge";

export type PreferredContact = "email" | "phone" | "whatsapp";
const META: Record<PreferredContact, { label: string; tone: Tone; icon: typeof Mail }> = {
  email: { label: "Email", tone: "blue", icon: Mail },
  phone: { label: "Phone call", tone: "amber", icon: Phone },
  whatsapp: { label: "WhatsApp", tone: "green", icon: MessageCircle },
};

/** How the business asked to be contacted first (chosen at registration). Shown wherever staff might reach out. */
export function ContactBadge({ value, className }: { value: string | null | undefined; className?: string }) {
  const m = META[value as PreferredContact];
  if (!m) return <span className="text-[12px] text-muted">—</span>;
  return <Badge tone={m.tone} className={className}><m.icon size={11} />{m.label}</Badge>;
}
