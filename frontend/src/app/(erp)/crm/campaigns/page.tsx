"use client";
import { Plus, Megaphone } from "lucide-react";

const campaigns = [
  { id: 1, name: "July Promo",      type: "Email", sent: 320, opened: 180, status: "Active",    start: "2025-07-01" },
  { id: 2, name: "New Arrivals",    type: "SMS",   sent: 500, opened: 420, status: "Completed", start: "2025-06-15" },
  { id: 3, name: "Loyalty Rewards", type: "Email", sent: 150, opened: 90,  status: "Draft",     start: "2025-08-01" },
];
const statusColor: Record<string, string> = {
  Active: "bg-emerald-50 text-emerald-700", Completed: "bg-blue-50 text-blue-700", Draft: "bg-surface text-muted",
};
export default function CampaignsPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Campaigns</h1>
        <button className="flex items-center gap-2 bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90"><Plus size={16} />New Campaign</button>
      </div>
      <div className="bg-white border border-border">
        <table className="w-full">
          <thead><tr className="border-b border-border text-left text-xs text-muted">
            <th className="p-4 font-medium">Campaign</th><th className="p-4 font-medium">Type</th><th className="p-4 font-medium">Start</th><th className="p-4 font-medium text-right">Sent</th><th className="p-4 font-medium text-right">Opened</th><th className="p-4 font-medium">Status</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {campaigns.map((c) => (
              <tr key={c.id} className="hover:bg-surface/50">
                <td className="p-4"><div className="flex items-center gap-2"><Megaphone size={14} className="text-accent" /><span className="text-sm font-medium text-foreground">{c.name}</span></div></td>
                <td className="p-4 text-sm text-muted">{c.type}</td>
                <td className="p-4 text-sm text-muted">{c.start}</td>
                <td className="p-4 text-right text-sm">{c.sent}</td>
                <td className="p-4 text-right text-sm">{c.opened} <span className="text-muted text-xs">({Math.round(c.opened/c.sent*100)}%)</span></td>
                <td className="p-4"><span className={`text-xs font-medium px-2 py-1 ${statusColor[c.status]}`}>{c.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
