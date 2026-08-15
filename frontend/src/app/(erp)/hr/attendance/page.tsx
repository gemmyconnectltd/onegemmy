"use client";

import { useState } from "react";
import { CheckCircle, XCircle, Clock, Plus, Trash2 } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import type { ApiAttendance } from "@/lib/api/hr";
import { useAttendance, useEmployees, useCreateAttendance, useDeleteAttendance } from "@/lib/api/hooks";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import { EmptyState, ErrorState, StatusBadge } from "@/components/hr/State";

const statusIcon: Record<string, React.ReactNode> = {
  Present: <CheckCircle size={14} className="text-emerald-500" />,
  Late: <Clock size={14} className="text-amber-500" />,
  Absent: <XCircle size={14} className="text-red-500" />,
};

export default function AttendancePage() {
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    employee_id: "",
    date: new Date().toISOString().slice(0, 10),
    check_in: "08:00",
    check_out: "17:00",
    status: "Present",
  });

  const { data: attData, isLoading: attLoading, isError, refetch } = useAttendance();
  const { data: empData, isLoading: empLoading } = useEmployees();
  const records = attData?.items ?? [];
  const employees = empData?.items ?? [];
  const loading = attLoading || empLoading;
  const error = isError ? "Could not load attendance." : null;

  const createAttendance = useCreateAttendance();
  const deleteAttendance = useDeleteAttendance();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.employee_id) return;
    createAttendance.mutate({
      employee_id: form.employee_id,
      date: form.date,
      check_in: form.check_in || null,
      check_out: form.check_out || null,
      status: form.status,
    }, {
      onSuccess: () => {
        setShowForm(false);
        setForm({ ...form, employee_id: "" });
      },
      onError: () => setNotice("Could not record attendance (a record may already exist for this day)."),
    });
  };

  const remove = (r: ApiAttendance) => {
    if (!window.confirm("Delete this attendance record?")) return;
    deleteAttendance.mutate(r.id, { onError: () => setNotice("Could not delete record.") });
  };

  const present = records.filter((r) => r.status === "Present").length;
  const late = records.filter((r) => r.status === "Late").length;
  const absent = records.filter((r) => r.status === "Absent").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Attendance</h1>
          <p className="text-sm text-muted mt-0.5">Daily check-in records for your team</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 text-white px-4 py-2.5 text-sm font-semibold transition-colors rounded-lg"
          style={{ backgroundColor: "#b45309" }}
        >
          <Plus size={15} /> Record Attendance
        </button>
      </div>

      {notice && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{notice}</p>}

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Present", value: present, color: "#10B981" },
          { label: "Late", value: late, color: "#f59e0b" },
          { label: "Absent", value: absent, color: "#ef4444" },
        ].map((s) => (
          <div key={s.label} className="bg-card p-4">
            <div className="w-8 h-8 flex items-center justify-center mb-2" style={{ backgroundColor: `${s.color}10` }}>
              <Clock size={16} style={{ color: s.color }} />
            </div>
            <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">{s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <PageLoader variant="compact" />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : records.length === 0 ? (
        <div className="bg-card border border-border rounded-xl">
          <EmptyState message="No attendance records yet." />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="p-4 font-semibold">Employee</th>
                <th className="p-4 font-semibold">Date</th>
                <th className="p-4 font-semibold">Check In</th>
                <th className="p-4 font-semibold">Check Out</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-surface/50 transition-colors">
                  <td className="p-4 text-sm font-medium text-foreground">{r.employee?.full_name ?? "—"}</td>
                  <td className="p-4 text-sm text-muted">{r.date}</td>
                  <td className="p-4 text-sm text-muted">{r.check_in ?? "—"}</td>
                  <td className="p-4 text-sm text-muted">{r.check_out ?? "—"}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium px-2 py-1 flex items-center gap-1">
                        {statusIcon[r.status]}
                      </span>
                      <StatusBadge status={r.status} />
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <button type="button" onClick={() => remove(r)} className="text-muted hover:text-red-500 transition-colors" aria-label="Delete record">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={showForm} onClose={() => setShowForm(false)} title="Record Attendance" description="Log an employee's attendance for a day">
        <form onSubmit={submit} className="space-y-4 p-5">
          <Field label="Employee" required>
            <Select required value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
              <option value="">Select employee</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Date" required>
            <Input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Check in">
              <Input type="time" value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })} />
            </Field>
            <Field label="Check out">
              <Input type="time" value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })} />
            </Field>
          </div>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="Present">Present</option>
              <option value="Late">Late</option>
              <option value="Absent">Absent</option>
              <option value="Half Day">Half Day</option>
            </Select>
          </Field>
          <FormFooter submitLabel={createAttendance.isPending ? "Saving…" : "Save Record"} onCancel={() => setShowForm(false)} disabled={createAttendance.isPending} />
        </form>
      </Drawer>
    </div>
  );
}
