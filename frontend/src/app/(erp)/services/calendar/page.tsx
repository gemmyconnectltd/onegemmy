"use client";
import { useAppConfig } from "@/lib/appConfig";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Clock, User, Users } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { type ApiAppointment } from "@/lib/api";
import { useAppointments, useEmployees } from "@/lib/api/hooks";
import { NewAppointmentDrawer } from "@/components/services/NewAppointmentDrawer";

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7am - 8pm

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-50 text-blue-700 border-blue-200", confirmed: "bg-violet-50 text-violet-700 border-violet-200",
  checked_in: "bg-amber-50 text-amber-700 border-amber-200", in_service: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200", cancelled: "bg-surface text-muted border-border",
  no_show: "bg-red-50 text-red-600 border-red-200",
};

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

export default function CalendarPage() {
  const { brandColor } = useAppConfig();
  const SVC_COLOR = brandColor;

  const [view, setView] = useState<"day" | "week">("day");
  const [staffView, setStaffView] = useState(false);
  const [anchor, setAnchor] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState<ApiAppointment | null>(null);

  const { data: empData } = useEmployees("Active");
  const employees = empData?.items ?? [];

  const rangeStart = useMemo(() => {
    if (view === "day") {
      const d = new Date(anchor);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    return startOfWeek(anchor);
  }, [anchor, view]);
  const rangeEnd = useMemo(() => {
    const d = new Date(rangeStart);
    d.setDate(d.getDate() + (view === "day" ? 1 : 7));
    return d;
  }, [rangeStart, view]);

  const { data, isLoading } = useAppointments(1, 500, {
    dateFrom: `${toISODate(rangeStart)}T00:00:00`,
    dateTo: `${toISODate(new Date(rangeEnd.getTime() - 1))}T23:59:59`,
  });
  const appointments = useMemo(
    () => (data?.items ?? []).filter((a) => a.status !== "cancelled"),
    [data],
  );

  function step(delta: number) {
    const next = new Date(anchor);
    next.setDate(next.getDate() + delta * (view === "day" ? 1 : 7));
    setAnchor(next);
  }

  function appointmentsForHour(hour: number, dayDate?: Date) {
    return appointments.filter((a) => {
      const start = new Date(a.scheduled_start);
      if (dayDate && start.toDateString() !== dayDate.toDateString()) return false;
      return start.getHours() === hour;
    });
  }

  function appointmentsForDay(dayDate: Date) {
    return appointments.filter((a) => new Date(a.scheduled_start).toDateString() === dayDate.toDateString());
  }

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(rangeStart);
    d.setDate(d.getDate() + i);
    return d;
  }), [rangeStart]);

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Calendar</h1>
          <p className="text-sm text-muted mt-0.5">
            {view === "day" ? anchor.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" }) : `Week of ${rangeStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-surface rounded-lg p-1">
            {(["day", "week"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                style={view === v ? { backgroundColor: SVC_COLOR } : {}}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md capitalize transition-colors ${view === v ? "text-white" : "text-muted hover:text-foreground"}`}>
                {v}
              </button>
            ))}
          </div>
          {view === "day" && (
            <button onClick={() => setStaffView(!staffView)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${staffView ? "text-white border-transparent" : "border-border text-muted hover:text-foreground"}`}
              style={staffView ? { backgroundColor: SVC_COLOR } : {}}>
              <Users size={13} /> By Staff
            </button>
          )}
          <Button onClick={() => setShowForm(true)} color={SVC_COLOR} className="rounded-lg">
            <Plus size={15} /> New Appointment
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => step(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted hover:text-foreground hover:bg-surface transition-colors">
          <ChevronLeft size={15} />
        </button>
        <button onClick={() => setAnchor(new Date())} className="px-3 h-8 rounded-lg border border-border text-xs font-semibold text-muted hover:text-foreground hover:bg-surface transition-colors">
          Today
        </button>
        <button onClick={() => step(1)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted hover:text-foreground hover:bg-surface transition-colors">
          <ChevronRight size={15} />
        </button>
      </div>

      {view === "day" ? (
        staffView ? (
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm overflow-x-auto">
            <div className="grid" style={{ gridTemplateColumns: `80px repeat(${Math.max(employees.length, 1)}, minmax(160px, 1fr))` }}>
              <div className="border-b border-r border-border bg-surface/50" />
              {employees.map((e) => (
                <div key={e.id} className="border-b border-r border-border bg-surface/50 px-3 py-2.5 text-xs font-semibold text-foreground">{e.full_name}</div>
              ))}
              {employees.length === 0 && <div className="border-b border-border bg-surface/50 px-3 py-2.5 text-xs text-muted">No active staff</div>}
              {HOURS.map((h) => (
                <FragmentRow key={h} hour={h} employees={employees} appointmentsForHour={appointmentsForHour} anchor={anchor} onSelect={setDetail} />
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm divide-y divide-border">
            {HOURS.map((h) => {
              const items = appointmentsForHour(h, anchor);
              return (
                <div key={h} className="flex">
                  <div className="w-20 shrink-0 px-4 py-3 text-xs font-semibold text-muted">{h % 12 === 0 ? 12 : h % 12}{h < 12 ? "am" : "pm"}</div>
                  <div className="flex-1 px-3 py-2 flex flex-wrap gap-2 min-h-13">
                    {items.map((a) => (
                      <button key={a.id} onClick={() => setDetail(a)}
                        className={`text-left px-3 py-1.5 rounded-lg border text-xs font-semibold ${STATUS_COLORS[a.status]}`}>
                        {new Date(a.scheduled_start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {a.customer_name}
                        {a.employee && <span className="font-normal"> · {a.employee.full_name}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="grid grid-cols-7 gap-3">
          {weekDays.map((d) => {
            const items = appointmentsForDay(d);
            const isToday = d.toDateString() === new Date().toDateString();
            return (
              <div key={d.toISOString()} className={`bg-card border rounded-xl p-3 min-h-40 ${isToday ? "border-foreground/30" : "border-border"}`}>
                <button onClick={() => { setAnchor(d); setView("day"); }} className="text-left w-full mb-2">
                  <p className="text-[11px] font-semibold text-muted uppercase">{d.toLocaleDateString(undefined, { weekday: "short" })}</p>
                  <p className={`text-sm font-bold ${isToday ? "" : "text-foreground"}`} style={isToday ? { color: SVC_COLOR } : {}}>{d.getDate()}</p>
                </button>
                <div className="space-y-1.5">
                  {items.slice(0, 4).map((a) => (
                    <button key={a.id} onClick={() => setDetail(a)}
                      className={`w-full text-left px-2 py-1 rounded-md border text-[11px] font-semibold truncate ${STATUS_COLORS[a.status]}`}>
                      {new Date(a.scheduled_start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} {a.customer_name}
                    </button>
                  ))}
                  {items.length > 4 && <p className="text-[11px] text-muted">+{items.length - 4} more</p>}
                  {items.length === 0 && <p className="text-[11px] text-muted/70">No appointments</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NewAppointmentDrawer open={showForm} onClose={() => setShowForm(false)} defaultDate={toISODate(anchor)} color={SVC_COLOR} />

      <Drawer open={!!detail} onClose={() => setDetail(null)} title="Appointment" description={detail ? new Date(detail.scheduled_start).toLocaleString() : undefined}>
        {detail && (
          <div className="p-5 space-y-4">
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Customer</p>
              <p className="text-sm font-semibold text-foreground">{detail.customer_name}</p>
              {detail.customer_phone && <p className="text-xs text-muted">{detail.customer_phone}</p>}
            </div>
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Services</p>
              <div className="space-y-1">
                {detail.services.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{s.service_name}</span>
                    <span className="text-muted flex items-center gap-1"><Clock size={11} /> {s.duration_minutes} min</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Staff</p>
              <p className="text-sm text-foreground flex items-center gap-1.5"><User size={13} className="text-muted" /> {detail.employee?.full_name ?? "Unassigned"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Status</p>
              <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full border ${STATUS_COLORS[detail.status]}`}>{detail.status.replace("_", " ")}</span>
            </div>
            {detail.notes && (
              <div>
                <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Notes</p>
                <p className="text-sm text-foreground/80">{detail.notes}</p>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

function FragmentRow({
  hour, employees, appointmentsForHour, anchor, onSelect,
}: {
  hour: number;
  employees: { id: string; full_name: string }[];
  appointmentsForHour: (h: number, d?: Date) => ApiAppointment[];
  anchor: Date;
  onSelect: (a: ApiAppointment) => void;
}) {
  const items = appointmentsForHour(hour, anchor);
  return (
    <>
      <div className="border-b border-r border-border px-3 py-2.5 text-xs font-semibold text-muted">
        {hour % 12 === 0 ? 12 : hour % 12}{hour < 12 ? "am" : "pm"}
      </div>
      {employees.map((e) => {
        const cellItems = items.filter((a) => a.employee_id === e.id);
        return (
          <div key={e.id} className="border-b border-r border-border px-2 py-1.5 min-h-11 space-y-1">
            {cellItems.map((a) => (
              <button key={a.id} onClick={() => onSelect(a)}
                className={`w-full text-left px-2 py-1 rounded-md border text-[11px] font-semibold truncate ${STATUS_COLORS[a.status]}`}>
                {a.customer_name}
              </button>
            ))}
          </div>
        );
      })}
      {employees.length === 0 && <div className="border-b border-border px-3 py-2.5" />}
    </>
  );
}
