"use client";
import { Suspense, use, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Building2, Clock, Mail, Phone, ShieldCheck, Users } from "lucide-react";
import { useEmployeeAccess, useTeamOptions, useTeamUser, useTenant } from "@/lib/api/hooks";
import type { TeamUser } from "@/lib/api/admin";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Badge } from "@/components/ui/Badge";
import { ErrorState } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/ui/PageLoader";
import { TabStrip } from "@/components/ui/TabStrip";
import AccessByModule from "../../AccessByModule";
import { DangerZone, PasswordForm, ProfileForm, RecoveryLinkButton, UserActivity } from "../../UserSections";

/** The page's tabs. Access (features and permissions together) is what people come here for, so it opens first. */
const TABS = [
  { key: "access", label: "Access" },
  { key: "profile", label: "Profile & branches" },
  { key: "security", label: "Sign-in & security" },
  { key: "activity", label: "Activity" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// Businesses → a business → Users & Access → one user: everything about their account on one page.
export default function BusinessUserPage({ params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = use(params);
  return <Suspense fallback={<PageLoader />}><BusinessUser id={id} userId={userId} /></Suspense>;
}

function BusinessUser({ id, userId }: { id: string; userId: string }) {
  const tenant = useTenant(id);
  const user = useTeamUser(id, userId);
  const router = useRouter();
  const backHref = `/tenants/${encodeURIComponent(id)}?tab=users`;

  if (tenant.isLoading || user.isLoading) return <PageLoader />;
  if (tenant.isError || !tenant.data) return <ErrorState message="Could not load this business." onRetry={() => void tenant.refetch()} />;
  return (
    <BusinessShell tenant={tenant.data} panel="users">
      <div className="min-w-0 space-y-4">
        <Link href={backHref} className="inline-flex min-h-8 items-center gap-1.5 text-sm font-semibold text-muted hover:text-foreground"><ArrowLeft size={14} aria-hidden /> All users</Link>
        {user.isError || !user.data
          ? <ErrorState message="Could not load this user." onRetry={() => void user.refetch()} />
          : <UserWorkspace tenantId={id} user={user.data} onRemoved={() => router.push(backHref)} />}
      </div>
    </BusinessShell>
  );
}

function UserWorkspace({ tenantId, user, onRemoved }: { tenantId: string; user: TeamUser; onRemoved: () => void }) {
  const access = useEmployeeAccess(tenantId, user.id);
  const departments = useTeamOptions(tenantId, "departments", 1);
  const [profileDirty, setProfileDirty] = useState(false);
  const { tab, select, visited } = useTab();
  useLeaveWarning(profileDirty);

  const a = access.data;
  const department = departments.data?.items.find((d) => d.id === user.department_id)?.name;
  const branches = !a ? null : a.branches.all ? "All branches" : a.branches.branches.map((b) => b.name).join(", ") || "No branches";
  const initials = user.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  const lastSignIn = user.last_login ? new Date(user.last_login).toLocaleString() : "Never signed in";

  return (
    <>
      {/* Who they are and the one thing you most often do for them, at a glance. */}
      <section aria-label="User summary" className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-4">
            <span aria-hidden className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-accent/10 text-lg font-bold text-accent">{initials}</span>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="pesaa-section-title break-words text-foreground">{user.full_name}</h2>
                <Badge tone={user.is_active ? "green" : "slate"} dot>{user.is_active ? "Active" : "Inactive"}</Badge>
                {user.is_superuser && <Badge tone="violet">Owner</Badge>}
              </div>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                <span className="inline-flex min-w-0 items-center gap-1.5 break-all"><Mail size={14} aria-hidden className="flex-shrink-0" />{user.email}</span>
                {user.phone && <span className="inline-flex items-center gap-1.5"><Phone size={14} aria-hidden />{user.phone}</span>}
              </p>
            </div>
          </div>
          <RecoveryLinkButton tenantId={tenantId} user={user} />
        </div>
        <dl className="grid grid-cols-1 gap-px border-t border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
          <Fact icon={ShieldCheck} label="Role" value={user.is_superuser ? "Owner" : user.role || "No role"} />
          <Fact icon={Users} label="Department" value={department || "None"} />
          <Fact icon={Building2} label="Branch access" value={branches ?? "Loading…"} />
          <Fact icon={Clock} label="Last sign-in" value={lastSignIn} />
        </dl>
        {!user.is_active && <p role="status" className="border-t border-border bg-surface px-4 py-2.5 text-sm text-muted sm:px-5">This account is inactive and cannot sign in. Reactivate it in the danger zone below.</p>}
      </section>

      <div className="sticky top-14 z-10 -mx-1 bg-background px-1">
        <TabStrip label="User sections" items={TABS.map((t) => ({ key: t.key, label: t.label, active: tab === t.key, onSelect: () => select(t.key), dot: t.key === "profile" && profileDirty }))} />
      </div>

      {/* Each tab mounts the first time it is opened and then stays mounted (hidden), so unsaved edits survive switching tabs. */}
      <TabPanel id="access" tab={tab} visited={visited}><AccessByModule tenantId={tenantId} userId={user.id} /></TabPanel>
      <TabPanel id="profile" tab={tab} visited={visited}>
        <Card title="Profile & branches" description="Name, contact, role, department and the branches they work in.">
          <ProfileForm key={`${user.id}:${user.updated_at}`} tenantId={tenantId} user={user} onDirtyChange={setProfileDirty} />
        </Card>
      </TabPanel>
      <TabPanel id="security" tab={tab} visited={visited}>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Card title="Set a password" description="Give them a password yourself. To let them choose their own, use Send recovery link at the top.">
            <PasswordForm tenantId={tenantId} user={user} />
          </Card>
          <Card title="Danger zone" tone="danger" description="Actions that end or remove this person's access.">
            <DangerZone tenantId={tenantId} user={user} onRemoved={onRemoved} />
          </Card>
        </div>
      </TabPanel>
      <TabPanel id="activity" tab={tab} visited={visited}>
        <Card title="Activity" description="Changes made to this account, newest first.">
          <UserActivity tenantId={tenantId} userId={user.id} />
        </Card>
      </TabPanel>
    </>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5 bg-card px-4 py-3 sm:px-5">
      <Icon size={16} aria-hidden className="mt-0.5 flex-shrink-0 text-muted" />
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-muted">{label}</dt>
        <dd className="break-words text-sm font-medium text-foreground">{value}</dd>
      </div>
    </div>
  );
}

function TabPanel({ id, tab, visited, children }: { id: TabKey; tab: TabKey; visited: Set<TabKey>; children: ReactNode }) {
  if (!visited.has(id)) return null;
  return <div role="tabpanel" aria-label={TABS.find((t) => t.key === id)?.label} hidden={tab !== id} className="min-w-0">{children}</div>;
}

function Card({ title, description, tone, children }: { title: string; description?: string; tone?: "danger"; children: ReactNode }) {
  return (
    <section className={`min-w-0 rounded-xl border bg-card ${tone === "danger" ? "border-red-500/30" : "border-border"}`}>
      <header className={`border-b px-4 py-3 sm:px-5 ${tone === "danger" ? "border-red-500/20" : "border-border"}`}>
        <h3 className={`pesaa-card-title ${tone === "danger" ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>{title}</h3>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

/** The open tab lives in the URL (?section=), so refresh and shared links land on the same tab. */
function useTab() {
  const params = useSearchParams(), router = useRouter(), pathname = usePathname();
  const tab: TabKey = TABS.find((t) => t.key === params.get("section"))?.key ?? "access";
  const [visited, setVisited] = useState<Set<TabKey>>(() => new Set([tab]));
  if (!visited.has(tab)) setVisited(new Set([...visited, tab]));
  const select = (key: TabKey) => {
    const next = new URLSearchParams(params.toString());
    next.set("section", key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return { tab, select, visited };
}

/** Ask before closing or reloading the tab with unsaved profile edits. */
function useLeaveWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}
