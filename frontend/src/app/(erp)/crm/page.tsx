"use client";

import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, CalendarCheck, ContactRound, Mail, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableScroll } from "@/components/ui/TableScroll";
import { useAuth } from "@/lib/auth";
import {
  useCrmActivities, useCrmCampaigns, useCrmContacts, useCrmEmails, useCrmOpportunities,
} from "@/lib/api/hooks";

const cards = [
  { title: "Contacts", href: "/crm/contacts", icon: ContactRound, key: "contacts" },
  { title: "Opportunities", href: "/crm/opportunities", icon: BriefcaseBusiness, key: "opportunities" },
  { title: "Open activities", href: "/crm/activities", icon: CalendarCheck, key: "activities" },
  { title: "Campaigns", href: "/crm/campaigns", icon: Megaphone, key: "campaigns" },
  { title: "Email records", href: "/crm/emails", icon: Mail, key: "emails" },
] as const;

function activityDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

export default function CrmHome() {
  const { hasPermission } = useAuth();
  const permitted = {
    contacts: hasPermission("contacts:read"),
    opportunities: hasPermission("opportunities:read"),
    activities: hasPermission("activities:read"),
    campaigns: hasPermission("campaigns:read"),
    emails: hasPermission("campaigns:read"),
  };
  const contacts = useCrmContacts(1, 1, undefined, undefined, { enabled: permitted.contacts });
  const opportunities = useCrmOpportunities(1, 1, undefined, undefined, { enabled: permitted.opportunities });
  const activities = useCrmActivities(1, 5, { status: "open" }, { enabled: permitted.activities });
  const campaigns = useCrmCampaigns(1, 1, undefined, undefined, { enabled: permitted.campaigns });
  const emails = useCrmEmails(1, 1, undefined, undefined, { enabled: permitted.emails });
  const queries = [
    ...(permitted.contacts ? [contacts] : []),
    ...(permitted.opportunities ? [opportunities] : []),
    ...(permitted.activities ? [activities] : []),
    ...(permitted.campaigns ? [campaigns] : []),
    ...(permitted.emails ? [emails] : []),
  ];
  const failed = queries.some(query => query.isError);
  const loading = queries.some(query => query.isLoading);
  const values = {
    contacts: contacts.data?.total,
    opportunities: opportunities.data?.total,
    activities: activities.data?.total,
    campaigns: campaigns.data?.total,
    emails: emails.data?.total,
  };

  return (
    <section className="min-w-0 space-y-5">
      <header>
        <h1 className="pesaa-page-title">CRM</h1>
        <p className="mt-1 text-sm text-muted">Customer relationships, sales opportunities and follow-ups in one workspace.</p>
      </header>
      {loading ? <PageLoader variant="compact" /> : failed ? (
        <div role="alert" className="rounded-xl border border-border bg-card p-4 text-sm text-red-600">
          Could not load the CRM overview. <Button variant="outline" onClick={() => queries.forEach(query => void query.refetch())}>Retry</Button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.filter(({ key }) => permitted[key]).map(({ title, href, icon: Icon, key }) => (
              <Link key={key} href={href} className="group rounded-xl border border-border bg-card p-4 transition-colors hover:bg-surface">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold"><Icon size={17} aria-hidden className="text-accent" />{title}</div>
                  <ArrowRight size={16} aria-hidden className="text-muted transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="mt-3 text-2xl font-semibold tabular-nums">{values[key] ?? 0}</p>
              </Link>
            ))}
          </div>
          {permitted.activities && <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="pesaa-section-title">Upcoming activity</h2><p className="mt-1 text-sm text-muted">Open CRM follow-ups, meetings and reminders.</p></div>
              <Link href="/crm/activities"><Button variant="outline">View activities</Button></Link>
            </div>
            <TableScroll label="Upcoming CRM activity" mobileLayout="cards">
              <table className="w-full min-w-[620px] text-sm">
                <thead><tr><th scope="col" className="text-left">Activity</th><th scope="col" className="text-left">Linked record</th><th scope="col" className="text-left">Due</th><th scope="col" className="text-left">Status</th></tr></thead>
                <tbody>
                  {activities.data?.items.map(item => (
                    <tr key={item.id}>
                      <td data-label="Activity"><div className="font-semibold">{item.subject}</div><div className="text-xs capitalize text-muted">{item.kind}</div></td>
                      <td data-label="Linked record">{item.customer?.name ?? item.deal?.name ?? <span className="text-muted">Record removed</span>}</td>
                      <td data-label="Due">{activityDate(item.due_at)}</td>
                      <td data-label="Status" className="capitalize">{item.status}</td>
                    </tr>
                  ))}
                  {activities.data?.items.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted">No CRM activity yet.</td></tr>}
                </tbody>
              </table>
            </TableScroll>
          </section>}
        </>
      )}
    </section>
  );
}
