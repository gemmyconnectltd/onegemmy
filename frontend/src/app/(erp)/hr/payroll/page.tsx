"use client";
import { DollarSign } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";

const payroll = [
  { id: 1, name: "Alice Uwimana",   role: "Sales Manager",  salary: 350000, bonus: 50000, deductions: 35000, status: "Paid" },
  { id: 2, name: "Bob Nkurunziza",  role: "Accountant",     salary: 300000, bonus: 0,     deductions: 30000, status: "Paid" },
  { id: 3, name: "Claire Mukamana", role: "HR Officer",     salary: 280000, bonus: 20000, deductions: 28000, status: "Pending" },
  { id: 4, name: "Eve Ingabire",    role: "Sales Rep",      salary: 200000, bonus: 30000, deductions: 20000, status: "Paid" },
];

export default function PayrollPage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => `${currencySymbol} ${v.toLocaleString()}`;
  const totalNet = payroll.reduce((s, p) => s + (p.salary + p.bonus - p.deductions), 0);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-foreground">Payroll</h1>
          <p className="text-sm text-muted mt-1">Total net: <span className="font-bold text-accent">{fmt(totalNet)}</span></p>
        </div>
        <button className="flex items-center gap-2 bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90"><DollarSign size={16} />Run Payroll</button>
      </div>
      <div className="bg-card border border-border">
        <table className="w-full">
          <thead><tr className="border-b border-border text-left text-xs text-muted">
            <th className="p-4 font-medium">Employee</th><th className="p-4 font-medium text-right">Salary</th><th className="p-4 font-medium text-right">Bonus</th><th className="p-4 font-medium text-right">Deductions</th><th className="p-4 font-medium text-right">Net Pay</th><th className="p-4 font-medium">Status</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {payroll.map((p) => (
              <tr key={p.id} className="hover:bg-surface/50">
                <td className="p-4"><p className="text-sm font-medium text-foreground">{p.name}</p><p className="text-xs text-muted">{p.role}</p></td>
                <td className="p-4 text-right text-sm text-foreground">{fmt(p.salary)}</td>
                <td className="p-4 text-right text-sm text-emerald-600">{p.bonus ? fmt(p.bonus) : "—"}</td>
                <td className="p-4 text-right text-sm text-red-500">{fmt(p.deductions)}</td>
                <td className="p-4 text-right text-sm font-bold text-foreground">{fmt(p.salary + p.bonus - p.deductions)}</td>
                <td className="p-4"><span className={`text-xs font-medium px-2 py-1 ${p.status === "Paid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{p.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
