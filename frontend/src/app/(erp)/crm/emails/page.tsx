"use client";
import { Plus, Mail } from "lucide-react";

const emails = [
  { id: 1, to: "jean@acme.com",   subject: "Follow-up on proposal",  date: "2025-07-25", status: "Sent" },
  { id: 2, to: "marie@beta.com",  subject: "New product launch",     date: "2025-07-24", status: "Opened" },
  { id: 3, to: "pat@charlie.com", subject: "Meeting confirmation",   date: "2025-07-23", status: "Sent" },
  { id: 4, to: "imm@delta.com",   subject: "Invoice #INV-045",       date: "2025-07-22", status: "Bounced" },
];
const statusColor: Record<string, string> = {
  Sent: "bg-blue-50 text-blue-700", Opened: "bg-emerald-50 text-emerald-700", Bounced: "bg-red-50 text-red-600",
};
export default function EmailsPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Emails</h1>
        <button className="flex items-center gap-2 bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90"><Plus size={16} />Compose</button>
      </div>
      <div className="bg-card border border-border">
        <table className="w-full">
          <thead><tr className="border-b border-border text-left text-xs text-muted">
            <th className="p-4 font-medium">To</th><th className="p-4 font-medium">Subject</th><th className="p-4 font-medium">Date</th><th className="p-4 font-medium">Status</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {emails.map((e) => (
              <tr key={e.id} className="hover:bg-surface/50">
                <td className="p-4"><div className="flex items-center gap-2"><Mail size={13} className="text-muted" /><span className="text-sm text-foreground">{e.to}</span></div></td>
                <td className="p-4 text-sm font-medium text-foreground">{e.subject}</td>
                <td className="p-4 text-sm text-muted">{e.date}</td>
                <td className="p-4"><span className={`text-xs font-medium px-2 py-1 ${statusColor[e.status]}`}>{e.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
