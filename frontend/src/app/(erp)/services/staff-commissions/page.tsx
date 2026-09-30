"use client";
import { useAppConfig } from "@/lib/appConfig";

import { useState } from "react";
import { UserCheck, Search, Settings2, Plus, Trash2, Sparkles } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { fmtMoney } from "@/lib/config";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Select, Input } from "@/components/ui/Form";
import { type ApiEmployee, type ApiEmployeeService } from "@/lib/api";
import {
  useEmployees, useAllServices, useEmployeeServices,
  useCreateEmployeeService, useUpdateEmployeeService, useDeleteEmployeeService,
} from "@/lib/api/hooks";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

const initials = (name: string) => name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

export default function StaffCommissionsPage() {
  const { brandColor, currencySymbol } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);
  const SVC_COLOR = brandColor;

  const [search, setSearch] = useState("");
  const [managing, setManaging] = useState<ApiEmployee | null>(null);

  const { data: empData, isLoading: empLoading } = useEmployees("Active");
  const { data: allServices, isLoading: svcLoading } = useAllServices();
  const { data: employeeServices, isLoading: esLoading } = useEmployeeServices();

  const employees = empData?.items ?? [];
  const services = allServices ?? [];
  const assignments = employeeServices ?? [];

  const filtered = employees.filter((e) => e.full_name.toLowerCase().includes(search.toLowerCase()));

  function assignmentsFor(employeeId: string): ApiEmployeeService[] {
    return assignments.filter((a) => a.employee_id === employeeId);
  }

  const loading = empLoading || svcLoading || esLoading;
  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Staff & Commissions</h1>
        <p className="text-sm text-muted mt-0.5">{employees.length} active staff member{employees.length === 1 ? "" : "s"}</p>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input type="text" placeholder="Search staff..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none bg-surface/50" />
          </div>
          <span className="text-xs text-muted ml-auto">{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-160">
            <thead>
              <tr className="border-b border-border bg-surface/50 text-left">
                {["Employee", "Services They Perform", "Services Completed", "Service Revenue", "Commission Earned", ""].map((h, i) => (
                  <th key={i} className={`px-5 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider ${["Services Completed", "Service Revenue", "Commission Earned"].includes(h) ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((e) => {
                const empAssignments = assignmentsFor(e.id);
                return (
                  <tr key={e.id} className="hover:bg-surface/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ backgroundColor: `${SVC_COLOR}15`, color: SVC_COLOR }}>
                          {initials(e.full_name)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{e.full_name}</p>
                          <p className="text-[11px] text-muted">{e.job_title ?? e.employee_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {empAssignments.length === 0 ? (
                        <span className="text-sm text-muted">Not assigned to any service</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 max-w-xs">
                          {empAssignments.map((a) => (
                            <span key={a.id} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface text-muted">
                              {a.service?.name ?? "—"}
                              {a.commission_type && (
                                <span className="ml-1" style={{ color: SVC_COLOR }}>
                                  {a.commission_type === "percentage" ? `${a.commission_value}%` : fmt(a.commission_value)}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right text-sm font-semibold text-foreground tabular-nums">0</td>
                    <td className="px-5 py-3.5 text-right text-sm text-muted tabular-nums">{fmt(0)}</td>
                    <td className="px-5 py-3.5 text-right text-sm text-muted tabular-nums">{fmt(0)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <Button variant="secondary" size="sm" onClick={() => setManaging(e)} className="rounded-lg">
                        <Settings2 size={13} /> Manage
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <UserCheck size={36} className="text-border mx-auto mb-3" />
                    <p className="text-sm font-semibold text-muted">No staff found</p>
                    <p className="text-xs text-muted/70 mt-1">Add employees in HR to assign them to services here.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ManageServicesDrawer
        employee={managing}
        onClose={() => setManaging(null)}
        services={services}
        assignments={managing ? assignmentsFor(managing.id) : []}
        color={SVC_COLOR}
        fmt={fmt}
      />
    </div>
  );
}

function ManageServicesDrawer({
  employee, onClose, services, assignments, color, fmt,
}: {
  employee: ApiEmployee | null;
  onClose: () => void;
  services: { id: string; name: string; is_active: boolean }[];
  assignments: ApiEmployeeService[];
  color: string;
  fmt: (v: number) => string;
}) {
  const createEmployeeService = useCreateEmployeeService();
  const updateEmployeeService = useUpdateEmployeeService();
  const deleteEmployeeService = useDeleteEmployeeService();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const [addingServiceId, setAddingServiceId] = useState("");
  const [commissionType, setCommissionType] = useState<"percentage" | "fixed">("percentage");
  const [commissionValue, setCommissionValue] = useState("");

  const assignedServiceIds = new Set(assignments.map((a) => a.service_id));
  const availableServices = services.filter((s) => s.is_active && !assignedServiceIds.has(s.id));

  async function handleAssign() {
    if (!employee || !addingServiceId) return;
    await createEmployeeService.mutateAsync({
      employee_id: employee.id,
      service_id: addingServiceId,
      commission_type: commissionType,
      commission_value: Number(commissionValue) || 0,
    });
    setAddingServiceId("");
    setCommissionValue("");
  }

  function handleRemove(assignment: ApiEmployeeService) {
    confirm({
      title: "Remove Assignment",
      message: `Remove ${employee?.full_name} from ${assignment.service?.name}?`,
      confirmLabel: "Remove",
      danger: true,
      onConfirm: () => deleteEmployeeService.mutate(assignment.id),
    });
  }

  function handleCommissionChange(assignment: ApiEmployeeService, field: "commission_type" | "commission_value", value: string) {
    updateEmployeeService.mutate({
      id: assignment.id,
      data: field === "commission_type" ? { commission_type: value } : { commission_value: Number(value) || 0 },
    });
  }

  return (
    <Drawer
      open={!!employee}
      onClose={onClose}
      title={employee ? `${employee.full_name} — Services` : "Services"}
      description="Which services this employee can perform, and their commission"
    >
      {confirmDialog}
      <div className="p-5 space-y-3">
        {assignments.length === 0 && (
          <p className="text-sm text-muted text-center py-6">Not assigned to any service yet.</p>
        )}
        {assignments.map((a) => (
          <div key={a.id} className="border border-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={13} style={{ color }} />
                <span className="text-sm font-semibold text-foreground">{a.service?.name ?? "—"}</span>
              </div>
              <button onClick={() => handleRemove(a)} className="text-muted hover:text-red-500 rounded-md p-1">
                <Trash2 size={13} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={a.commission_type ?? "percentage"} onChange={(e) => handleCommissionChange(a, "commission_type", e.target.value)}>
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed amount</option>
              </Select>
              <Input type="number" min="0" step="0.01" defaultValue={a.commission_value}
                onBlur={(e) => handleCommissionChange(a, "commission_value", e.target.value)}
                placeholder={a.commission_type === "fixed" ? fmt(0) : "0%"} />
            </div>
          </div>
        ))}

        <div className="border-t border-border pt-4 space-y-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">Assign a service</p>
          <Select value={addingServiceId} onChange={(e) => setAddingServiceId(e.target.value)}>
            <option value="">Select a service…</option>
            {availableServices.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
          {addingServiceId && (
            <div className="grid grid-cols-2 gap-2">
              <Select value={commissionType} onChange={(e) => setCommissionType(e.target.value as "percentage" | "fixed")}>
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed amount</option>
              </Select>
              <Input type="number" min="0" step="0.01" value={commissionValue} onChange={(e) => setCommissionValue(e.target.value)}
                placeholder={commissionType === "fixed" ? fmt(0) : "0%"} />
            </div>
          )}
          <Button onClick={handleAssign} disabled={!addingServiceId || createEmployeeService.isPending} color={color} className="w-full rounded-lg justify-center">
            <Plus size={14} /> {createEmployeeService.isPending ? "Assigning…" : "Assign Service"}
          </Button>
          {availableServices.length === 0 && !addingServiceId && (
            <p className="text-xs text-muted text-center">All active services are already assigned.</p>
          )}
        </div>
      </div>
    </Drawer>
  );
}
