import { BarChart3, Download, Calendar } from "lucide-react";

const reports = [
  { name: "Sales Report", description: "Revenue, deals, and pipeline analysis", lastGenerated: "2024-01-15", type: "Sales" },
  { name: "Inventory Report", description: "Stock levels, movements, and valuation", lastGenerated: "2024-01-14", type: "Inventory" },
  { name: "Financial Summary", description: "P&L, cash flow, and balance sheet", lastGenerated: "2024-01-13", type: "Finance" },
  { name: "Employee Report", description: "Headcount, attendance, and performance", lastGenerated: "2024-01-12", type: "HR" },
  { name: "Project Status", description: "Progress, timelines, and budgets", lastGenerated: "2024-01-11", type: "Projects" },
];

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-sm text-muted mt-1">Generate and download business reports</p>
        </div>
        <button className="flex items-center gap-2 bg-accent text-white px-4 py-2.5 text-sm font-medium hover:bg-accent/90 transition-colors">
          <BarChart3 size={16} />
          Generate Report
        </button>
      </div>

      <div className="grid gap-4">
        {reports.map((report, i) => (
          <div key={i} className="bg-white border border-border p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-primary/10 flex items-center justify-center">
                <BarChart3 size={20} className="text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">{report.name}</h3>
                <p className="text-xs text-muted mt-0.5">{report.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <span className="text-xs font-medium px-2.5 py-1 bg-surface text-foreground/70">{report.type}</span>
                <p className="text-xs text-muted mt-1">Last: {report.lastGenerated}</p>
              </div>
              <button className="flex items-center gap-2 px-3 py-2 border border-border text-sm text-foreground hover:bg-surface transition-colors">
                <Download size={14} />
                Export
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
