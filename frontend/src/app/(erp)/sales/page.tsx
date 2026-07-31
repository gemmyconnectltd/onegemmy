import { Plus, Search, Filter, TrendingUp, ArrowUpRight, MoreHorizontal } from "lucide-react";
import Link from "next/link";

const stages = [
  { name: "Leads", count: 24, color: "bg-muted" },
  { name: "Qualified", count: 18, color: "bg-foreground" },
  { name: "Proposal", count: 12, color: "bg-secondary" },
  { name: "Negotiation", count: 8, color: "bg-accent" },
  { name: "Closed Won", count: 15, color: "bg-emerald-500" },
];

const deals = [
  { id: 1, name: "Enterprise License - Acme Corp", value: "$120,000", stage: "Negotiation", owner: "John D.", probability: 75 },
  { id: 2, name: "SaaS Platform - Beta LLC", value: "$45,000", stage: "Proposal", owner: "Sarah M.", probability: 50 },
  { id: 3, name: "Consulting - Charlie Inc", value: "$28,000", stage: "Qualified", owner: "Mike R.", probability: 30 },
  { id: 4, name: "Annual Plan - Delta Co", value: "$96,000", stage: "Closed Won", owner: "John D.", probability: 100 },
  { id: 5, name: "Custom Solution - Echo Ltd", value: "$67,000", stage: "Proposal", owner: "Sarah M.", probability: 60 },
];

export default function SalesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sales Pipeline</h1>
          <p className="text-sm text-muted mt-1">Track and manage your sales deals</p>
        </div>
        <Link
          href="/sales/new"
          className="flex items-center gap-2 bg-accent text-white px-4 py-2.5 text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          <Plus size={16} />
          New Deal
        </Link>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {stages.map((stage) => (
          <div key={stage.name} className="bg-white rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${stage.color}`} />
                <span className="text-sm font-medium text-foreground">{stage.name}</span>
              </div>
              <span className="text-xs text-muted bg-surface px-2 py-0.5 rounded-full">{stage.count}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-border">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search deals..."
              className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <button className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm text-foreground hover:bg-surface transition-colors">
            <Filter size={14} />
            Filter
          </button>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-muted border-b border-border">
              <th className="p-4 font-medium">Deal Name</th>
              <th className="p-4 font-medium">Value</th>
              <th className="p-4 font-medium">Stage</th>
              <th className="p-4 font-medium">Owner</th>
              <th className="p-4 font-medium">Probability</th>
              <th className="p-4 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {deals.map((deal) => (
              <tr key={deal.id} className="hover:bg-surface/50 transition-colors">
                <td className="p-4">
                  <span className="text-sm font-medium text-foreground hover:text-primary cursor-pointer">{deal.name}</span>
                </td>
                <td className="p-4 text-sm font-semibold text-foreground">{deal.value}</td>
                <td className="p-4">
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-foreground/10 text-foreground">{deal.stage}</span>
                </td>
                <td className="p-4 text-sm text-foreground/70">{deal.owner}</td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-surface rounded-full h-1.5">
                      <div className="bg-foreground rounded-full h-1.5" style={{ width: `${deal.probability}%` }} />
                    </div>
                    <span className="text-xs text-muted">{deal.probability}%</span>
                  </div>
                </td>
                <td className="p-4">
                  <button className="text-muted hover:text-foreground"><MoreHorizontal size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
