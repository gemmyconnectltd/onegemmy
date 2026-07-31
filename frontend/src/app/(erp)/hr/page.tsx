"use client";
import { Users, ArrowUpRight, ArrowDownRight, UserCheck, Clock } from "lucide-react";

const employees = [
  { id: 1, name: "Alice Uwimana",   role: "Sales Manager",  dept: "Sales",   status: "Active",   joined: "2023-01-15" },
  { id: 2, name: "Bob Nkurunziza",  role: "Accountant",     dept: "Finance", status: "Active",   joined: "2023-03-20" },
  { id: 3, name: "Claire Mukamana", role: "HR Officer",     dept: "HR",      status: "Active",   joined: "2022-11-05" },
  { id: 4, name: "David Habimana",  role: "Warehouse Staff",dept: "Ops",     status: "On Leave", joined: "2024-02-10" },
  { id: 5, name: "Eve Ingabire",    role: "Sales Rep",      dept: "Sales",   status: "Active",   joined: "2024-05-01" },
];

export default function HRPage() {
  const active = employees.filter((e) => e.status === "Active").length;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Employees</h1>
        <button className="flex items-center gap-2 bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90"><Users size={16} />Add Employee</button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total",    value: employees.length, icon: Users,     color: "#6f1a07" },
          { label: "Active",   value: active,           icon: UserCheck, color: "#10B981" },
          { label: "On Leave", value: employees.length - active, icon: Clock, color: "#f59e0b" },
        ].map((s) => (
          <div key={s.label} className="bg-card p-4">
            <div className="w-8 h-8 flex items-center justify-center mb-2" style={{ backgroundColor: `${s.color}10` }}><s.icon size={16} style={{ color: s.color }} /></div>
            <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">{s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="bg-card border border-border">
        <table className="w-full">
          <thead><tr className="border-b border-border text-left text-xs text-muted">
            <th className="p-4 font-medium">Name</th><th className="p-4 font-medium">Role</th><th className="p-4 font-medium">Department</th><th className="p-4 font-medium">Joined</th><th className="p-4 font-medium">Status</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {employees.map((e) => (
              <tr key={e.id} className="hover:bg-surface/50">
                <td className="p-4"><div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">{e.name.split(" ").map((n) => n[0]).join("").slice(0,2)}</div>
                  <span className="text-sm font-medium text-foreground">{e.name}</span>
                </div></td>
                <td className="p-4 text-sm text-muted">{e.role}</td>
                <td className="p-4 text-sm text-muted">{e.dept}</td>
                <td className="p-4 text-sm text-muted">{e.joined}</td>
                <td className="p-4"><span className={`text-xs font-medium px-2 py-1 ${e.status === "Active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{e.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
