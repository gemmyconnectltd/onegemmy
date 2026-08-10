"use client";

import { useMemo, useState } from "react";
import { Search, UserRound } from "lucide-react";

import { PageHeader } from "@/components/mobile/PageHeader";
import { useEmployees } from "@/lib/api/hooks";

const STATUS_STYLES: Record<string, string> = {
  Active: "bg-emerald-500/10 text-emerald-600",
  Inactive: "bg-muted/20 text-muted",
  OnLeave: "bg-amber-500/10 text-amber-600",
  Terminated: "bg-red-500/10 text-red-600",
};

export default function MobileEmployeesPage() {
  const employeesQ = useEmployees();
  const [query, setQuery] = useState("");

  const employees = useMemo(() => {
    const list = employeesQ.data?.items ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (e) =>
        e.full_name.toLowerCase().includes(q) ||
        (e.job_title ?? "").toLowerCase().includes(q) ||
        (e.employee_code ?? "").toLowerCase().includes(q),
    );
  }, [employeesQ.data, query]);

  return (
    <div className="min-h-full flex flex-col pb-6">
      <PageHeader title="Employees" subtitle={`${employeesQ.data?.items?.length ?? 0} on your team`} />
      <div className="flex-1 px-4 pt-4 space-y-3">
        <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3">
          <Search size={15} className="text-muted flex-shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or role"
            className="w-full bg-transparent py-2.5 text-[13px] text-foreground placeholder:text-muted outline-none"
          />
        </div>

        {employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <UserRound size={28} className="text-muted/40 mb-2" />
            <p className="text-[13px] text-muted">No employees found</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl divide-y divide-border">
            {employees.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center text-accent flex-shrink-0">
                  <UserRound size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground truncate">{e.full_name}</p>
                  <p className="text-[10px] text-muted truncate">
                    {e.job_title || "Team member"}
                    {e.department ? ` · ${e.department.name}` : ""}
                  </p>
                </div>
                <span className={`px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wide ${STATUS_STYLES[e.employment_status] ?? "bg-muted/20 text-muted"}`}>
                  {e.employment_status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
