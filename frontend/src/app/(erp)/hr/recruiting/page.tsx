"use client";
import { UserPlus } from "lucide-react";

const applicants = [
  { id: 1, name: "Frank Mugisha",  role: "Sales Rep",    stage: "Interview", date: "2025-07-25" },
  { id: 2, name: "Grace Uwase",    role: "Accountant",   stage: "Applied",   date: "2025-07-24" },
  { id: 3, name: "Henry Niyonzima",role: "Warehouse",    stage: "Offer",     date: "2025-07-22" },
  { id: 4, name: "Irene Mukasa",   role: "HR Assistant", stage: "Rejected",  date: "2025-07-20" },
];

const stageColor: Record<string, string> = {
  Applied:   "bg-blue-50 text-blue-700",
  Interview: "bg-amber-50 text-amber-700",
  Offer:     "bg-emerald-50 text-emerald-700",
  Rejected:  "bg-red-50 text-red-600",
};

export default function RecruitingPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Recruiting</h1>
        <button className="flex items-center gap-2 bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90"><UserPlus size={16} />Add Applicant</button>
      </div>
      <div className="bg-card border border-border">
        <table className="w-full">
          <thead><tr className="border-b border-border text-left text-xs text-muted">
            <th className="p-4 font-medium">Applicant</th><th className="p-4 font-medium">Role</th><th className="p-4 font-medium">Applied</th><th className="p-4 font-medium">Stage</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {applicants.map((a) => (
              <tr key={a.id} className="hover:bg-surface/50">
                <td className="p-4"><div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">{a.name.split(" ").map((n)=>n[0]).join("").slice(0,2)}</div>
                  <span className="text-sm font-medium text-foreground">{a.name}</span>
                </div></td>
                <td className="p-4 text-sm text-muted">{a.role}</td>
                <td className="p-4 text-sm text-muted">{a.date}</td>
                <td className="p-4"><span className={`text-xs font-medium px-2 py-1 ${stageColor[a.stage]}`}>{a.stage}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
