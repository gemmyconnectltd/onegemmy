"use client";

import { useState } from "react";
import { Users, UserCheck, Clock, AlertTriangle, RefreshCw, Plus, Trash2 } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import type { ApiEmployee } from "@/lib/api/hr";
import { useEmployees, useDepartments, useCreateEmployee, useDeleteEmployee } from "@/lib/api/hooks";
import { fmtMoney } from "@/lib/config";
import { useAppConfig } from "@/lib/appConfig";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-emerald-50 text-emerald-700",
  "On Leave": "bg-amber-50 text-amber-700",
  Terminated: "bg-red-50 text-red-600",
};

const STATUSES = ["All", "Active", "On Leave", "Terminated"];

function Loading() {
  return <PageLoader variant="compact" />;
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-muted py-12 text-center">{message}</p>;
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-card border border-border rounded-xl py-12 px-6 text-center space-y-3">
      <AlertTriangle size={22} className="mx-auto text-red-500" />
      <p className="text-sm font-semibold text-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-border bg-surface text-sm font-semibold text-foreground hover:bg-surface/70"
      >
        <RefreshCw size={14} /> Retry
      </button>
    </div>
  );
}

const initials = (name: string) =>
  name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

export default function EmployeesPage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);

  const [status, setStatus] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    department_id: "",
    job_title: "",
    employment_status: "Active",
    hire_date: new Date().toISOString().slice(0, 10),
    salary: "",
  });

  const { data: empData, isLoading: empLoading, isError, refetch } = useEmployees(status === "All" ? undefined : status);
  const { data: deptData, isLoading: deptLoading } = useDepartments();
  const employees = empData?.items ?? [];
  const departments = deptData?.items ?? [];
  const loading = empLoading || deptLoading;
  const error = isError ? "Could not load employees." : null;

  const createEmployee = useCreateEmployee();
  const deleteEmployee = useDeleteEmployee();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    createEmployee.mutate({
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email || null,
      phone: form.phone || null,
      department_id: form.department_id || null,
      job_title: form.job_title || null,
      employment_status: form.employment_status,
      hire_date: form.hire_date || null,
      salary: Number(form.salary) || 0,
    }, {
      onSuccess: () => {
        setShowForm(false);
        setForm({ first_name: "", last_name: "", email: "", phone: "", department_id: "", job_title: "", employment_status: "Active", hire_date: new Date().toISOString().slice(0, 10), salary: "" });
      },
      onError: () => setNotice("Could not add employee."),
    });
  };

  const remove = (emp: ApiEmployee) => {
    if (!window.confirm(`Delete ${emp.full_name}?`)) return;
    deleteEmployee.mutate(emp.id, { onError: () => setNotice("Could not delete employee.") });
  };

  const active = employees.filter((e) => e.employment_status === "Active").length;
  const onLeave = employees.filter((e) => e.employment_status === "On Leave").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Employees</h1>
          <p className="text-sm text-muted mt-0.5">Manage your team and their information</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 text-white px-4 py-2.5 text-sm font-semibold transition-colors rounded-lg"
          style={{ backgroundColor: "#b45309" }}
        >
          <Plus size={15} /> Add Employee
        </button>
      </div>

      {notice && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{notice}</p>}

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total", value: employees.length, icon: Users, color: "#b45309" },
          { label: "Active", value: active, icon: UserCheck, color: "#10B981" },
          { label: "On Leave", value: onLeave, icon: Clock, color: "#f59e0b" },
        ].map((s) => (
          <div key={s.label} className="bg-card p-4">
            <div className="w-8 h-8 flex items-center justify-center mb-2" style={{ backgroundColor: `${s.color}10` }}>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">{s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${status === s ? "text-white" : "text-muted hover:bg-surface"}`}
            style={status === s ? { backgroundColor: "#b45309" } : undefined}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : employees.length === 0 ? (
        <div className="bg-card border border-border rounded-xl">
          <EmptyState message={status === "All" ? "No employees yet — add your first team member." : `No employees with status "${status}".`} />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="p-4 font-semibold">Employee</th>
                <th className="p-4 font-semibold">Department</th>
                <th className="p-4 font-semibold">Hire Date</th>
                <th className="p-4 font-semibold text-right">Salary</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {employees.map((e) => (
                <tr key={e.id} className="hover:bg-surface/50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">
                        {initials(e.full_name)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{e.full_name}</p>
                        <p className="text-xs text-muted">{e.employee_code}{e.job_title ? ` · ${e.job_title}` : ""}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-muted">{e.department?.name ?? "—"}</td>
                  <td className="p-4 text-sm text-muted">{e.hire_date ?? "—"}</td>
                  <td className="p-4 text-right text-sm font-semibold text-foreground">{fmt(e.salary)}</td>
                  <td className="p-4">
                    <span className={`text-xs font-medium px-2 py-1 ${STATUS_COLORS[e.employment_status] ?? "bg-surface text-muted"}`}>{e.employment_status}</span>
                  </td>
                  <td className="p-4 text-right">
                    <button type="button" onClick={() => remove(e)} className="text-muted hover:text-red-500 transition-colors" aria-label={`Delete ${e.full_name}`}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Add Employee"
        description="Create a new employee record"
      >
        <form onSubmit={submit} className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" required>
              <Input required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} placeholder="Aisha" />
            </Field>
            <Field label="Last name" required>
              <Input required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder="Bello" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="aisha@company.com" />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+254 700 000 000" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Department">
              <Select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                <option value="">No department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Job title">
              <Input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} placeholder="Engineer" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <Select value={form.employment_status} onChange={(e) => setForm({ ...form, employment_status: e.target.value })}>
                <option value="Active">Active</option>
                <option value="On Leave">On Leave</option>
                <option value="Terminated">Terminated</option>
              </Select>
            </Field>
            <Field label="Salary">
              <Input type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} placeholder="0" />
            </Field>
          </div>
          <Field label="Hire date">
            <Input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} />
          </Field>
          <FormFooter submitLabel={createEmployee.isPending ? "Saving…" : "Add Employee"} onCancel={() => setShowForm(false)} disabled={createEmployee.isPending} />
        </form>
      </Drawer>
    </div>
  );
}
