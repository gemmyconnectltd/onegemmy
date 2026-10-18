"use client";

import { Bell, Mail, Info } from "lucide-react";
import { NotAvailable, SettingsCard } from "@/components/settings/parts";

// Notification preferences have no backend yet (nothing is stored or sent), so these are listed honestly
// rather than as toggles that would only look like they work.
export default function NotificationsSettingsPage() {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
    <SettingsCard title="Email Notifications" description="Choose which email notifications you want to receive." icon={Bell}>
      <NotAvailable label="Low stock alerts" hint="When products fall below their minimum stock." />
      <NotAvailable label="New orders" hint="When a new order is placed." />
      <NotAvailable label="Payments received" hint="When a payment or invoice is settled." />
      <NotAvailable label="System alerts" hint="Important system and security notices." />
      <p className="pb-4 pt-1 text-[12px] text-muted">Email and push notifications aren&apos;t built yet. They&apos;ll appear here as real switches once they can be saved.</p>
    </SettingsCard>
    <SettingsCard title="Notification Email" description="Business notification delivery." icon={Mail}>
      <div className="my-3 flex items-start gap-3 rounded-xl bg-accent/5 p-4 text-xs leading-relaxed text-muted"><Info size={18} className="shrink-0 text-accent" />A delivery address can be configured once email notifications are available.</div>
    </SettingsCard>
    </div>
  );
}
