"use client";
import { useAppConfig } from "@/lib/appConfig";

import { useState } from "react";
import { CalendarDays, Plus, Search, MoreVertical, Clock } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { Button } from "@/components/ui/Button";
import { type ApiAppointment } from "@/lib/api";
import { useAppointments, useUpdateAppointment, useEmployees } from "@/lib/api/hooks";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { Pagination } from "@/components/ui/Pagination";
import { NewAppointmentDrawer } from "@/components/services/NewAppointmentDrawer";

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled", confirmed: "Confirmed", checked_in: "Checked In",
  in_service: "In Service", completed: "Completed", cancelled: "Cancelled", no_show: "No-show",
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-50 text-blue-700", confirmed: "bg-violet-50 text-violet-700",
  checked_in: "bg-amber-50 text-amber-700", in_service: "bg-amber-50 text-amber-700",
  completed: "bg-emerald-50 text-emerald-700", cancelled: "bg-surface text-muted", no_show: "bg-red-50 text-red-600",
};

const NEXT_ACTIONS: Record<string, { label: string; status: string }[]> = {
  scheduled: [{ label: "Confirm", status: "confirmed" }, { label: "Check In", status: "checked_in" }, { label: "No-show", status: "no_show" }, { label: "Cancel", status: "cancelled" }],
  confirmed: [{ label: "Check In", status: "checked_in" }, { label: "No-show", status: "no_show" }, { label: "Cancel", status: "cancelled" }],
  checked_in: [{ label: "Start Service", status: "in_service" }, { label: "Cancel", status: "cancelled" }],
  in_service: [{ label: "Complete", status: "completed" }],
  completed: [], cancelled: [], no_show: [],
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function AppointmentsPage() {
  const { brandColor } = useAppConfig();
  const SVC_COLOR = brandColor;

  const [date, setDate] = useState(todayISO());
  const [status, setStatus] = useState<string>("all");
  const [employeeId, setEmployeeId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const dateFrom = `${date}T00:00:00`;
  const dateTo = `${date}T23:59:59`;

  const { data, isLoading, isFetching } = useAppointments(page, pageSize, {
    dateFrom, dateTo,
    status: status === "all" ? undefined : status,
    employeeId: employeeId === "all" ? undefined : employeeId,
    search: debouncedSearch || undefined,
  });
  const { data: empData } = useEmployees("Active");
  const employees = empData?.items ?? [];
  const appointments = data?.items ?? [];
  const total = data?.total ?? 0;

  const updateAppointment = useUpdateAppointment();

  function transition(appt: ApiAppointment, newStatus: string) {
    setOpenMenu(null);
    updateAppointment.mutate({ id: appt.id, data: { status: newStatus } });
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Appointments</h1>
          <p className="text-sm text-muted mt-0.5">{total} appointment{total === 1 ? "" : "s"} on {new Date(date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</p>
        </div>
        <Button onClick={() => setShowForm(true)} color={SVC_COLOR} className="rounded-lg">
          <Plus size={15} /> New Appointment
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border flex items-center gap-3 flex-wrap">
          <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-border rounded-lg text-sm bg-surface/50 outline-none focus:border-foreground/30" />
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input type="text" placeholder="Search customer..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none bg-surface/50" />
          </div>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-border rounded-lg text-sm bg-surface/50 outline-none focus:border-foreground/30">
            <option value="all">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-border rounded-lg text-sm bg-surface/50 outline-none focus:border-foreground/30">
            <option value="all">All staff</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
          <span className="text-xs text-muted ml-auto">{total} result{total === 1 ? "" : "s"}</span>
        </div>

        <div className={`overflow-x-auto transition-opacity ${isFetching ? "opacity-60" : ""}`}>
          <table className="w-full min-w-160">
            <thead>
              <tr className="border-b border-border bg-surface/50 text-left">
                {["Time", "Customer", "Service", "Staff", "Duration", "Status", ""].map((h) => (
                  <th key={h} className="px-5 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {appointments.map((a) => {
                const totalMinutes = a.services.reduce((s, x) => s + x.duration_minutes, 0);
                const actions = NEXT_ACTIONS[a.status] ?? [];
                return (
                  <tr key={a.id} className="hover:bg-surface/40 transition-colors group">
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground tabular-nums">
                        <Clock size={12} className="text-muted" /> {fmtTime(a.scheduled_start)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-semibold text-foreground">{a.customer_name}</p>
                      {a.customer_phone && <p className="text-[11px] text-muted">{a.customer_phone}</p>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {a.services.map((s) => (
                          <span key={s.id} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface text-muted">{s.service_name}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-muted">{a.employee?.full_name ?? "Unassigned"}</td>
                    <td className="px-5 py-3.5 text-sm text-muted tabular-nums">{totalMinutes} min</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[a.status]}`}>
                        {STATUS_LABELS[a.status]}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 relative">
                      {actions.length > 0 && (
                        <button onClick={() => setOpenMenu(openMenu === a.id ? null : a.id)}
                          className="w-7 h-7 flex items-center justify-center text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                          <MoreVertical size={14} />
                        </button>
                      )}
                      {openMenu === a.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                          <div className="absolute right-4 top-full mt-1 w-40 bg-card border border-border rounded-xl shadow-lg z-20 py-1.5 overflow-hidden">
                            {actions.map((act) => (
                              <button key={act.status} onClick={() => transition(a, act.status)}
                                className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-surface transition-colors ${act.status === "cancelled" || act.status === "no_show" ? "text-red-600" : "text-foreground"}`}>
                                {act.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {appointments.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <CalendarDays size={36} className="text-border mx-auto mb-3" />
                    <p className="text-sm font-semibold text-muted">No appointments scheduled for this day</p>
                    <button onClick={() => setShowForm(true)} className="mt-3 text-sm font-semibold hover:underline" style={{ color: SVC_COLOR }}>
                      + New Appointment
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={() => {}} itemLabel="appointments" color={SVC_COLOR} />
      </div>

      <NewAppointmentDrawer open={showForm} onClose={() => setShowForm(false)} defaultDate={date} color={SVC_COLOR} />
    </div>
  );
}
