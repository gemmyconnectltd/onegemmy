"use client";
import { useDmMe } from "@/lib/api/hooks";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/ui/PageLoader";
import { BusinessDirectory } from "./BusinessDirectory";
import { errorText } from "./common";

/** Pick a business for a page that works on one business (history, recovery, closing a period): no business's records are shown until one is chosen. */
export function BusinessPicker({ hrefFor = (id: string) => `/data-management?tenant=${id}`, title }: { hrefFor?: (tenantId: string) => string; title?: string }) {
  const me = useDmMe();
  if (me.isLoading) return <PageLoader />;
  if (me.error) return <ErrorState message={errorText(me.error)} onRetry={() => void me.refetch()} />;
  // No Data Management permission is given automatically. Say so, and say how, instead of showing an error.
  if (!me.data?.permissions.includes("data:view")) {
    return (
      <div className="space-y-4">
        <div><h1 className="pesaa-page-title">Data Management</h1></div>
        <EmptyState title="Business record access is not granted" description="This account cannot open business records." />
        <div className="space-y-2 rounded-xl border border-border bg-card p-4 text-[13px]">
          <p className="font-semibold">To add the View business records permission, run on the server:</p>
          <code className="block overflow-x-auto whitespace-pre rounded-lg bg-surface px-3 py-2 text-[12px]">{`python -m scripts.grant_data_permissions --email <admin email> --grant view`}</code>
          <p className="text-muted">Permissions are granted individually and written to the audit log. Then reload this page.</p>
        </div>
      </div>
    );
  }
  return <BusinessDirectory hrefFor={(b) => hrefFor(b.id)} title={title ?? "Select a Business"} />;
}
