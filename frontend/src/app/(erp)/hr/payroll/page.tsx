"use client";

import { useState } from "react";
import { DollarSign, Trash2, Check } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import type { ApiPayroll } from "@/lib/api/hr";
import { usePayroll, useEmployees, useCreatePayroll, useMarkPaid, useDeletePayroll } from "@/lib/api/hooks";
import { fmtMoney } from "@/lib/config";
import { useAppConfig } from "@/lib/appConfig";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import { EmptyState, ErrorState, StatusBadge } from "@/components/hr/State";

export default function PayrollPage() {
  const { currencySymbol, brandColor } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);
  const currentPeriod = new Date().toISOString().slice(0, 7);

  const [period, setPeriod] = useState(currentPeriod);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    employee_id: "",
    base_salary: "",
    bonus: "0",
    deductions: "0",
  });

  const { data: payData, isLoading: payLoading, isError, refetch } = usePayroll(period);
  const { data: empData, isLoading: empLoading } = useEmployees();
  const entries = payData?.items ?? [];
  const employees = empData?.items ?? [];
  const loading = payLoading || empLoading;
  const error = isError ? "Could not load payroll." : null;

  const createPayroll = useCreatePayroll();
  const markPaid = useMarkPaid();
  const deletePayroll = useDeletePayroll();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.employee_id) return;
    createPayroll.mutate({
      employee_id: form.employee_id,
      period,
      base_salary: Number(form.base_salary) || 0,
      bonus: Number(form.bonus) || 0,
      deductions: Number(form.deductions) || 0,
    }, {
      onSuccess: () => {
        setShowForm(false);
        setForm({ employee_id: "", base_salary: "", bonus: "0", deductions: "0" });
      },
      onError: () => setNotice("Could not add the payroll entry (it may already exist for this period)."),
    });
  };

  const handleMarkPaid = (p: ApiPayroll) => {
    markPaid.mutate(p.id, { onError: () => setNotice("Could not mark as paid.") });
  };

  const remove = (p: ApiPayroll) => {
    if (!window.confirm("Delete this payroll entry?")) return;
    deletePayroll.mutate(p.id, { onError: () => setNotice("Could not delete the entry.") });
  };

  const totalNet = entries.reduce((s, p) => s + p.net_pay, 0);
  const totalPayable = entries.filter((p) => p.status === "Pending").reduce((s, p) => s + p.net_pay, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Payroll</h1>
          <p className="text-sm text-muted mt-0.5">Total net for {period}: <span className="font-bold text-accent">{fmt(totalNet)}</span></p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 text-white px-4 py-2.5 text-sm font-semibold transition-colors rounded-lg"
          style={{ backgroundColor: brandColor }}
        >
          <DollarSign size={15} /> Add Entry
        </button>
      </div>

      {notice && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{notice}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Period">
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </Field>
        <div className="flex-1" />
        <div className="bg-card border border-border rounded-lg px-4 py-2">
          <p className="text-[11px] text-muted font-medium">Pending net</p>
          <p className="text-sm font-bold text-foreground">{fmt(totalPayable)}</p>
        </div>
      </div>

      {loading ? (
        <PageLoader variant="compact" />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : entries.length === 0 ? (
        <div className="bg-card border border-border rounded-xl">
          <EmptyState message="No payroll entries for this period yet." />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="p-4 font-semibold">Employee</th>
                <th className="p-4 font-semibold text-right">Base Salary</th>
                <th className="p-4 font-semibold text-right">Bonus</th>
                <th className="p-4 font-semibold text-right">Deductions</th>
                <th className="p-4 font-semibold text-right">Net Pay</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((p) => (
                <tr key={p.id} className="hover:bg-surface/50 transition-colors">
                  <td className="p-4">
                    <p className="text-sm font-medium text-foreground">{p.employee?.full_name ?? "—"}</p>
                    {p.employee?.job_title && <p className="text-xs text-muted">{p.employee.job_title}</p>}
                  </td>
                  <td className="p-4 text-right text-sm text-foreground">{fmt(p.base_salary)}</td>
                  <td className="p-4 text-right text-sm text-emerald-600">{p.bonus ? fmt(p.bonus) : "—"}</td>
                  <td className="p-4 text-right text-sm text-red-500">{fmt(p.deductions)}</td>
                  <td className="p-4 text-right text-sm font-bold text-foreground">{fmt(p.net_pay)}</td>
                  <td className="p-4"><StatusBadge status={p.status} /></td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-1.5">
                      {p.status === "Pending" && (
                        <button
                          type="button"
                          onClick={() => handleMarkPaid(p)}
                          className="w-7 h-7 rounded-md flex items-center justify-center bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                          aria-label="Mark paid"
                        >
                          <Check size={14} />
                        </button>
                      )}
                      <button type="button" onClick={() => remove(p)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-red-500 hover:bg-red-50 transition-colors" aria-label="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={showForm} onClose={() => setShowForm(false)} title="Add Payroll Entry" description={`New payroll entry for ${period}`}>
        <form onSubmit={submit} className="space-y-4 p-5">
          <Field label="Employee" required>
            <Select required value={form.employee_id} onChange={(e) => {
              const emp = employees.find((x) => x.id === e.target.value);
              setForm({ ...form, employee_id: e.target.value, base_salary: emp ? String(emp.salary || 0) : "" });
            }}>
              <option value="">Select employee</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Base salary" required>
              <Input type="number" required value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} placeholder="0" />
            </Field>
            <Field label="Bonus">
              <Input type="number" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} placeholder="0" />
            </Field>
            <Field label="Deductions">
              <Input type="number" value={form.deductions} onChange={(e) => setForm({ ...form, deductions: e.target.value })} placeholder="0" />
            </Field>
          </div>
          <p className="text-xs text-muted">
            Net pay: <span className="font-bold text-foreground">{fmt((Number(form.base_salary) || 0) + (Number(form.bonus) || 0) - (Number(form.deductions) || 0))}</span>
          </p>
          <FormFooter submitLabel={createPayroll.isPending ? "Saving…" : "Add Entry"} onCancel={() => setShowForm(false)} disabled={createPayroll.isPending} />
        </form>
      </Drawer>
    </div>
  );
}
