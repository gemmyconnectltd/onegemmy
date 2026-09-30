"use client";
import { useAppConfig } from "@/lib/appConfig";

import { useState } from "react";
import { ListChecks, Plus, Sparkles, Clock, UserCheck, Play, Check, X } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { Button } from "@/components/ui/Button";
import { type ApiQueueEntry } from "@/lib/api";
import { useQueue, useUpdateQueueEntry, useEmployees } from "@/lib/api/hooks";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { NewWalkInDrawer } from "@/components/services/NewWalkInDrawer";

const STATUS_TABS = [
  { key: "waiting", label: "Waiting" },
  { key: "assigned", label: "Assigned" },
  { key: "in_service", label: "In Service" },
  { key: "completed", label: "Completed" },
] as const;

const STATUS_COLORS: Record<string, string> = {
  waiting: "bg-amber-50 text-amber-700", assigned: "bg-blue-50 text-blue-700",
  in_service: "bg-violet-50 text-violet-700", completed: "bg-emerald-50 text-emerald-700", removed: "bg-surface text-muted",
};

function waitTime(checkedInAt: string | null) {
  if (!checkedInAt) return "—";
  const mins = Math.max(0, Math.round((Date.now() - new Date(checkedInAt).getTime()) / 60000));
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function WalkInsPage() {
  const { brandColor } = useAppConfig();
  const SVC_COLOR = brandColor;

  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]["key"]>("waiting");
  const [showForm, setShowForm] = useState(false);
  const { data: entries, isLoading } = useQueue(tab);
  const { data: empData } = useEmployees("Active");
  const employees = empData?.items ?? [];
  const updateEntry = useUpdateQueueEntry();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  function assignStaff(entry: ApiQueueEntry, employeeId: string) {
    if (!employeeId) return;
    updateEntry.mutate({ id: entry.id, data: { employee_id: employeeId } });
  }

  function start(entry: ApiQueueEntry) {
    updateEntry.mutate({ id: entry.id, data: { status: "in_service" } });
  }

  function complete(entry: ApiQueueEntry) {
    updateEntry.mutate({ id: entry.id, data: { status: "completed" } });
  }

  function remove(entry: ApiQueueEntry) {
    confirm({
      title: "Remove from Queue",
      message: `Remove ${entry.customer_name} from the queue?`,
      confirmLabel: "Remove",
      danger: true,
      onConfirm: () => updateEntry.mutate({ id: entry.id, data: { status: "removed" } }),
    });
  }

  const list = entries ?? [];

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Walk-in Queue</h1>
          <p className="text-sm text-muted mt-0.5">{list.length} {STATUS_TABS.find((t) => t.key === tab)?.label.toLowerCase()}</p>
        </div>
        <Button onClick={() => setShowForm(true)} color={SVC_COLOR} className="rounded-lg">
          <Plus size={15} /> New Walk-in
        </Button>
      </div>

      <div className="flex items-center gap-1 bg-surface rounded-lg p-1 w-fit">
        {STATUS_TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={tab === t.key ? { backgroundColor: SVC_COLOR } : {}}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${tab === t.key ? "text-white" : "text-muted hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((entry) => (
          <div key={entry.id} className="bg-card border border-border rounded-xl p-4 space-y-3 hover:shadow-md transition-all">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-foreground">{entry.customer_name}</p>
                <p className="text-[11px] text-muted flex items-center gap-1 mt-0.5">
                  <Sparkles size={11} /> {entry.service_name}
                </p>
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[entry.status]}`}>
                {STATUS_TABS.find((t) => t.key === entry.status)?.label ?? entry.status}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-muted">
              <span className="flex items-center gap-1"><Clock size={11} /> Waiting {waitTime(entry.checked_in_at)}</span>
              {entry.employee && <span className="flex items-center gap-1"><UserCheck size={11} /> {entry.employee.full_name}</span>}
            </div>

            <div className="flex items-center gap-1.5 pt-2 border-t border-border">
              {tab === "waiting" && (
                <select
                  onChange={(e) => assignStaff(entry, e.target.value)}
                  defaultValue=""
                  className="flex-1 px-2 py-1.5 border border-border rounded-lg text-xs outline-none focus:border-foreground/30 bg-surface/50"
                >
                  <option value="" disabled>Assign staff…</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              )}
              {tab === "assigned" && (
                <button onClick={() => start(entry)} className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-white text-xs font-semibold" style={{ backgroundColor: SVC_COLOR }}>
                  <Play size={12} /> Start
                </button>
              )}
              {tab === "in_service" && (
                <button onClick={() => complete(entry)} className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-white text-xs font-semibold" style={{ backgroundColor: SVC_COLOR }}>
                  <Check size={12} /> Complete
                </button>
              )}
              {tab !== "completed" && (
                <button onClick={() => remove(entry)} className="w-8 h-8 flex items-center justify-center text-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" aria-label="Remove">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <div className="col-span-full py-16 text-center">
            <ListChecks size={36} className="text-border mx-auto mb-3" />
            <p className="text-sm font-semibold text-muted">No {STATUS_TABS.find((t) => t.key === tab)?.label.toLowerCase()} walk-ins</p>
            {tab === "waiting" && (
              <button onClick={() => setShowForm(true)} className="mt-3 text-sm font-semibold hover:underline" style={{ color: SVC_COLOR }}>
                + New Walk-in
              </button>
            )}
          </div>
        )}
      </div>

      <NewWalkInDrawer open={showForm} onClose={() => setShowForm(false)} color={SVC_COLOR} />
    </div>
  );
}
