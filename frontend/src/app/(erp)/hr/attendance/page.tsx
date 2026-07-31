"use client";
import { CheckCircle, XCircle, Clock } from "lucide-react";

const records = [
  { id: 1, name: "Alice Uwimana",   date: "2025-07-25", in: "08:02", out: "17:05", status: "Present" },
  { id: 2, name: "Bob Nkurunziza",  date: "2025-07-25", in: "08:45", out: "17:00", status: "Late" },
  { id: 3, name: "Claire Mukamana", date: "2025-07-25", in: "—",     out: "—",     status: "Absent" },
  { id: 4, name: "Eve Ingabire",    date: "2025-07-25", in: "07:58", out: "17:10", status: "Present" },
];

const statusIcon: Record<string, React.ReactNode> = {
  Present: <CheckCircle size={14} className="text-emerald-500" />,
  Late:    <Clock size={14} className="text-amber-500" />,
  Absent:  <XCircle size={14} className="text-red-500" />,
};
const statusColor: Record<string, string> = {
  Present: "bg-emerald-50 text-emerald-700",
  Late:    "bg-amber-50 text-amber-700",
  Absent:  "bg-red-50 text-red-600",
};

export default function AttendancePage() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-foreground">Attendance</h1>
      <div className="bg-white border border-border">
        <table className="w-full">
          <thead><tr className="border-b border-border text-left text-xs text-muted">
            <th className="p-4 font-medium">Employee</th><th className="p-4 font-medium">Date</th><th className="p-4 font-medium">Check In</th><th className="p-4 font-medium">Check Out</th><th className="p-4 font-medium">Status</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {records.map((r) => (
              <tr key={r.id} className="hover:bg-surface/50">
                <td className="p-4 text-sm font-medium text-foreground">{r.name}</td>
                <td className="p-4 text-sm text-muted">{r.date}</td>
                <td className="p-4 text-sm text-muted">{r.in}</td>
                <td className="p-4 text-sm text-muted">{r.out}</td>
                <td className="p-4"><div className="flex items-center gap-1.5"><span className={`text-xs font-medium px-2 py-1 flex items-center gap-1 ${statusColor[r.status]}`}>{statusIcon[r.status]}{r.status}</span></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
