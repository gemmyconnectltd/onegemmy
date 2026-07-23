import { DollarSign, TrendingUp, TrendingDown, CreditCard, ArrowUpRight, ArrowDownRight } from "lucide-react";

const stats = [
  { label: "Total Revenue", value: "$482,500", change: "+18.2%", up: true, icon: TrendingUp, color: "text-emerald-600" },
  { label: "Total Expenses", value: "$218,300", change: "+5.4%", up: true, icon: TrendingDown, color: "text-accent" },
  { label: "Net Profit", value: "$264,200", change: "+24.1%", up: true, icon: DollarSign, color: "text-primary" },
  { label: "Pending Payments", value: "$42,800", change: "-12.3%", up: false, icon: CreditCard, color: "text-secondary" },
];

const recentTransactions = [
  { date: "2024-01-15", description: "Payment from Acme Corp", type: "Income", amount: "+$12,000", category: "Sales" },
  { date: "2024-01-15", description: "Office Supplies", type: "Expense", amount: "-$340", category: "Operations" },
  { date: "2024-01-14", description: "Subscription Revenue", type: "Income", amount: "+$8,500", category: "Recurring" },
  { date: "2024-01-14", description: "Cloud Hosting", type: "Expense", amount: "-$1,200", category: "Infrastructure" },
  { date: "2024-01-13", description: "Consulting Fee - Beta LLC", type: "Income", amount: "+$6,700", category: "Services" },
  { date: "2024-01-13", description: "Employee Salaries", type: "Expense", amount: "-$45,000", category: "Payroll" },
];

export default function FinancePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Finance</h1>
          <p className="text-sm text-muted mt-1">Track revenue, expenses, and financial health</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2.5 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-surface transition-colors">
            Export Report
          </button>
          <button className="flex items-center gap-2 bg-accent text-white px-4 py-2.5 text-sm font-medium hover:bg-accent/90 transition-colors">
            + Add Transaction
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl p-5 border border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <stat.icon size={20} className={stat.color} />
              </div>
              <span className={`flex items-center gap-1 text-xs font-medium ${stat.up ? "text-emerald-600" : "text-red-500"}`}>
                {stat.up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {stat.change}
              </span>
            </div>
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-xs text-muted mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-border">
        <div className="p-5 border-b border-border">
          <h2 className="font-bold text-foreground">Recent Transactions</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-muted border-b border-border">
              <th className="p-4 font-medium">Date</th>
              <th className="p-4 font-medium">Description</th>
              <th className="p-4 font-medium">Category</th>
              <th className="p-4 font-medium">Type</th>
              <th className="p-4 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {recentTransactions.map((tx, i) => (
              <tr key={i} className="hover:bg-surface/50 transition-colors">
                <td className="p-4 text-sm text-muted">{tx.date}</td>
                <td className="p-4 text-sm font-medium text-foreground">{tx.description}</td>
                <td className="p-4">
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-surface text-foreground/70">{tx.category}</span>
                </td>
                <td className="p-4">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    tx.type === "Income" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                  }`}>
                    {tx.type}
                  </span>
                </td>
                <td className={`p-4 text-sm font-semibold text-right ${tx.type === "Income" ? "text-emerald-600" : "text-red-500"}`}>
                  {tx.amount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
