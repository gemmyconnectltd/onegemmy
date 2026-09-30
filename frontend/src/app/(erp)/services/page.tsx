"use client";
import { useAppConfig } from "@/lib/appConfig";
import { useMemo, useState } from "react";
import {
  CalendarDays, ListChecks, Clock, CheckCircle2, DollarSign, Plus, UserCheck,
} from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { Button } from "@/components/ui/Button";
import { fmtMoney } from "@/lib/config";
import { type ApiAppointment, type ApiQueueEntry } from "@/lib/api";
import { useAppointments, useQueue, useEmployees, useAllServices } from "@/lib/api/hooks";
import { NewAppointmentDrawer } from "@/components/services/NewAppointmentDrawer";
import { NewWalkInDrawer } from "@/components/services/NewWalkInDrawer";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-50 text-blue-700", confirmed: "bg-violet-50 text-violet-700",
  checked_in: "bg-amber-50 text-amber-700", in_service: "bg-amber-50 text-amber-700",
  completed: "bg-emerald-50 text-emerald-700", cancelled: "bg-surface text-muted", no_show: "bg-red-50 text-red-600",
  waiting: "bg-amber-50 text-amber-700", assigned: "bg-blue-50 text-blue-700",
};

export default function ServicesOverviewPage() {
  const { brandColor, currencySymbol } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);
  const SVC_COLOR = brandColor;

  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [showWalkInForm, setShowWalkInForm] = useState(false);

  const today = todayISO();
  const dateFrom = `${today}T00:00:00`;
  const dateTo = `${today}T23:59:59`;

  const { data: todayData, isLoading: apptLoading } = useAppointments(1, 200, { dateFrom, dateTo });
  const { data: upcomingData, isLoading: upcomingLoading } = useAppointments(1, 10, {
    dateFrom: `${today}T23:59:59`,
    status: "scheduled",
  });
  const { data: queueData, isLoading: queueLoading } = useQueue();
  const { data: empData, isLoading: empLoading } = useEmployees("Active");
  const { data: allServices } = useAllServices();

  const todaysAppointments = useMemo(
    () => (todayData?.items ?? []).filter((a) => a.status !== "cancelled").sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start)),
    [todayData],
  );
  const queue = queueData ?? [];
  const employees = empData?.items ?? [];
  const servicePriceById = useMemo(() => new Map((allServices ?? []).map((s) => [s.id, s.price])), [allServices]);

  const waiting = queue.filter((q) => q.status === "waiting" || q.status === "assigned");
  const inServiceQueue = queue.filter((q) => q.status === "in_service");
  const completedQueueToday = queue.filter((q) => q.status === "completed" && q.completed_at && q.completed_at.slice(0, 10) === today);

  const inServiceAppointments = todaysAppointments.filter((a) => a.status === "in_service");
  const completedAppointmentsToday = todaysAppointments.filter((a) => a.status === "completed");

  const currentlyInService = inServiceAppointments.length + inServiceQueue.length;
  const completedToday = completedAppointmentsToday.length + completedQueueToday.length;

  const appointmentRevenue = completedAppointmentsToday.reduce(
    (sum, a) => sum + a.services.reduce((s, x) => s + x.price, 0), 0,
  );
  const queueRevenue = completedQueueToday.reduce((sum, q) => sum + (q.service_id ? (servicePriceById.get(q.service_id) ?? 0) : 0), 0);
  const revenueToday = appointmentRevenue + queueRevenue;

  const now = new Date();
  function isEmployeeBusy(employeeId: string): boolean {
    const busyAppt = todaysAppointments.some((a) => {
      if (a.employee_id !== employeeId) return false;
      if (!["confirmed", "checked_in", "in_service"].includes(a.status)) return false;
      return new Date(a.scheduled_start) <= now && now <= new Date(a.scheduled_end);
    });
    if (busyAppt) return true;
    return queue.some((q) => q.employee_id === employeeId && q.status === "in_service");
  }

  const upcomingAppointments = (upcomingData?.items ?? []).slice(0, 5);

  const kpis = [
    { label: "Today's Appointments", value: todaysAppointments.length, icon: CalendarDays, color: "#3B82F6" },
    { label: "Walk-ins Waiting", value: waiting.length, icon: ListChecks, color: "#F59E0B" },
    { label: "Currently In Service", value: currentlyInService, icon: Clock, color: "#8B5CF6" },
    { label: "Completed Today", value: completedToday, icon: CheckCircle2, color: "#10B981" },
    { label: "Service Revenue Today", value: fmt(revenueToday), icon: DollarSign, color: SVC_COLOR, isMoney: true },
  ];

  const loading = apptLoading || queueLoading || empLoading || upcomingLoading;
  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Services</h1>
          <p className="text-sm text-muted mt-0.5">Today&apos;s operations at a glance</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowWalkInForm(true)} className="rounded-lg">
            <Plus size={15} /> New Walk-in
          </Button>
          <Button onClick={() => setShowAppointmentForm(true)} color={SVC_COLOR} className="rounded-lg">
            <Plus size={15} /> New Appointment
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="bg-card border border-border rounded-xl p-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2.5" style={{ backgroundColor: `${k.color}15` }}>
              <k.icon size={16} style={{ color: k.color }} />
            </div>
            <p className={`font-extrabold text-foreground tracking-tight truncate ${k.isMoney ? "text-lg" : "text-xl"}`} title={String(k.value)}>{k.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-bold text-foreground">Today&apos;s Schedule</h2>
            </div>
            <div className="divide-y divide-border">
              {todaysAppointments.map((a) => (
                <div key={a.id} className="px-5 py-3.5 flex items-center gap-3">
                  <span className="text-sm font-semibold text-foreground tabular-nums w-16 flex-shrink-0">{fmtTime(a.scheduled_start)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{a.customer_name}</p>
                    <p className="text-[11px] text-muted truncate">{a.services.map((s) => s.service_name).join(", ")}</p>
                  </div>
                  <span className="text-xs text-muted hidden sm:block">{a.employee?.full_name ?? "Unassigned"}</span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[a.status]}`}>{a.status.replace("_", " ")}</span>
                </div>
              ))}
              {todaysAppointments.length === 0 && (
                <div className="py-12 text-center">
                  <CalendarDays size={30} className="text-border mx-auto mb-2" />
                  <p className="text-sm font-semibold text-muted">No appointments scheduled for today</p>
                  <button onClick={() => setShowAppointmentForm(true)} className="mt-2 text-sm font-semibold hover:underline" style={{ color: SVC_COLOR }}>
                    + New Appointment
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-bold text-foreground">Upcoming Appointments</h2>
            </div>
            <div className="divide-y divide-border">
              {upcomingAppointments.map((a: ApiAppointment) => (
                <div key={a.id} className="px-5 py-3.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{a.customer_name}</p>
                    <p className="text-[11px] text-muted truncate">{a.services.map((s) => s.service_name).join(", ")}</p>
                  </div>
                  <span className="text-xs text-muted whitespace-nowrap">{new Date(a.scheduled_start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}, {fmtTime(a.scheduled_start)}</span>
                </div>
              ))}
              {upcomingAppointments.length === 0 && (
                <div className="py-10 text-center">
                  <p className="text-sm text-muted">No upcoming appointments booked yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">Current Queue</h2>
              <button onClick={() => setShowWalkInForm(true)} className="text-xs font-semibold hover:underline" style={{ color: SVC_COLOR }}>+ New Walk-in</button>
            </div>
            <div className="divide-y divide-border">
              {queue.filter((q) => ["waiting", "assigned", "in_service"].includes(q.status)).map((q: ApiQueueEntry) => (
                <div key={q.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{q.customer_name}</p>
                    <p className="text-[11px] text-muted truncate">{q.service_name}{q.employee ? ` · ${q.employee.full_name}` : ""}</p>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[q.status]}`}>{q.status.replace("_", " ")}</span>
                </div>
              ))}
              {queue.filter((q) => ["waiting", "assigned", "in_service"].includes(q.status)).length === 0 && (
                <div className="py-10 text-center">
                  <ListChecks size={26} className="text-border mx-auto mb-2" />
                  <p className="text-sm text-muted">No walk-ins waiting</p>
                  <button onClick={() => setShowWalkInForm(true)} className="mt-2 text-sm font-semibold hover:underline" style={{ color: SVC_COLOR }}>
                    + New Walk-in
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-bold text-foreground">Staff Availability</h2>
            </div>
            <div className="divide-y divide-border">
              {employees.map((e) => {
                const busy = isEmployeeBusy(e.id);
                return (
                  <div key={e.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: `${SVC_COLOR}15`, color: SVC_COLOR }}>
                      {e.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm text-foreground flex-1 truncate">{e.full_name}</span>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${busy ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${busy ? "bg-amber-500" : "bg-emerald-500"}`} />
                      {busy ? "Busy" : "Available"}
                    </span>
                  </div>
                );
              })}
              {employees.length === 0 && (
                <div className="py-10 text-center px-5">
                  <UserCheck size={26} className="text-border mx-auto mb-2" />
                  <p className="text-sm text-muted">No active staff yet. Add employees in HR, then assign them to services in Staff & Commissions.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <NewAppointmentDrawer open={showAppointmentForm} onClose={() => setShowAppointmentForm(false)} defaultDate={today} color={SVC_COLOR} />
      <NewWalkInDrawer open={showWalkInForm} onClose={() => setShowWalkInForm(false)} color={SVC_COLOR} />
    </div>
  );
}
