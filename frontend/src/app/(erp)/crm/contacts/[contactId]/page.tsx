"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableScroll } from "@/components/ui/TableScroll";
import { CustomerProfileScreen } from "@/components/customers/CustomerProfile";
import { useCrmActivities, useCrmContact } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth";

function activityDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

export default function CrmContactProfilePage() {
  const { contactId } = useParams<{ contactId: string }>();
  const { hasPermission } = useAuth();
  const contact = useCrmContact(contactId);
  const canReadActivities = hasPermission("activities:read");
  const activities = useCrmActivities(1, 10, { customer_id: contactId }, { enabled: canReadActivities });

  if (contact.isLoading) return <PageLoader variant="page" />;
  if (contact.isError || !contact.data) {
    return <div role="alert" className="space-y-3 text-sm text-red-600">
      <p>Could not load this CRM contact.</p>
      <Link href="/crm/contacts"><Button variant="outline">Back to contacts</Button></Link>
    </div>;
  }

  return (
    <div className="space-y-6">
      <CustomerProfileScreen id={contactId} backHref="/crm/contacts" backLabel="CRM contacts" />
      {canReadActivities && <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="pesaa-section-title">CRM activity</h2><p className="mt-1 text-sm text-muted">Recent calls, meetings, emails, notes and follow-ups for this contact.</p></div>
          <Link href="/crm/activities"><Button variant="outline">Manage activities</Button></Link>
        </div>
        {activities.isLoading ? <PageLoader variant="compact" /> : activities.isError ? (
          <p role="alert" className="text-sm text-red-600">Could not load CRM activity. <Button variant="outline" onClick={() => void activities.refetch()}>Retry</Button></p>
        ) : (
          <TableScroll label="Recent contact activity" mobileLayout="cards">
            <table className="w-full min-w-[620px] text-sm">
              <thead><tr><th scope="col" className="text-left">Activity</th><th scope="col" className="text-left">Type</th><th scope="col" className="text-left">Due</th><th scope="col" className="text-left">Status</th></tr></thead>
              <tbody>
                {activities.data?.items.map(item => (
                  <tr key={item.id}>
                    <td data-label="Activity"><div className="font-semibold">{item.subject}</div>{item.description && <p className="mt-1 text-xs text-muted">{item.description}</p>}</td>
                    <td data-label="Type" className="capitalize">{item.kind}</td>
                    <td data-label="Due">{activityDate(item.due_at)}</td>
                    <td data-label="Status" className="capitalize">{item.status}</td>
                  </tr>
                ))}
                {activities.data?.items.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted">No CRM activity recorded for this contact.</td></tr>}
              </tbody>
            </table>
          </TableScroll>
        )}
      </section>}
    </div>
  );
}
