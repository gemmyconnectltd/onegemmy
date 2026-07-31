"use client";

import { useState } from "react";
import { Receipt, Plus, DollarSign, Calendar, Tag, X } from "lucide-react";
import { CURRENCY_SYMBOL, expenseCategories } from "@/lib/config";

const mockExpenses = [
  { id: "1", description: "Shop rent - July", amount: 80000, category: "Rent", date: "2025-07-24" },
  { id: "2", description: "Electricity bill", amount: 15000, category: "Utilities", date: "2025-07-24" },
  { id: "3", description: "Restocking phone cases", amount: 45000, category: "Inventory Purchase", date: "2025-07-23" },
  { id: "4", description: "Transport to supplier", amount: 5000, category: "Transport", date: "2025-07-23" },
  { id: "5", description: "Packaging materials", amount: 8000, category: "Packaging", date: "2025-07-22" },
  { id: "6", description: "Facebook ad", amount: 12000, category: "Marketing", date: "2025-07-22" },
  { id: "7", description: "Counter repair", amount: 3000, category: "Maintenance", date: "2025-07-21" },
];

const formatCurrency = (value: number) => `${CURRENCY_SYMBOL} ${value.toLocaleString()}`;

function getCategoryColor(category: string) {
  const colors: Record<string, string> = {
    Rent: "bg-amber-100 text-amber-800",
    Utilities: "bg-blue-100 text-blue-800",
    "Inventory Purchase": "bg-purple-100 text-purple-800",
    Transport: "bg-emerald-100 text-emerald-800",
    Packaging: "bg-pink-100 text-pink-800",
    Marketing: "bg-orange-100 text-orange-800",
    Maintenance: "bg-red-100 text-red-800",
    Other: "bg-gray-100 text-gray-800",
  };
  return colors[category] || "bg-gray-100 text-gray-800";
}

export default function ExpensesPage() {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(expenseCategories[0]);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const todayTotal = mockExpenses
    .filter((e) => e.date === today)
    .reduce((sum, e) => sum + e.amount, 0);

  const categoryBreakdown = expenseCategories
    .map((cat) => ({
      category: cat,
      total: mockExpenses.filter((e) => e.category === cat).reduce((sum, e) => sum + e.amount, 0),
    }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  const maxCategoryAmount = Math.max(...categoryBreakdown.map((c) => c.total), 1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !amount) return;
    setShowSuccess(true);
    setDescription("");
    setAmount("");
    setCategory(expenseCategories[0]);
    setDate(new Date().toISOString().split("T")[0]);
    setTimeout(() => setShowSuccess(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Expenses</h1>
          <p className="text-sm text-muted mt-1">Track and manage your shop expenses</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-card border border-border rounded-xl px-5 py-3 flex items-center gap-3">
            <DollarSign size={18} className="text-accent" />
            <div>
              <p className="text-xs text-muted">Today&apos;s Expenses</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(todayTotal)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Expense Form */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-2 mb-4">
          <Receipt size={18} className="text-accent" />
          <h2 className="font-semibold text-foreground">Record Expense</h2>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <input
              type="text"
              placeholder="What was the expense for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div className="w-full sm:w-36">
            <input
              type="number"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              min="0"
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div className="w-full sm:w-44">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 bg-card"
            >
              {expenseCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-40">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <button
            type="submit"
            className="flex items-center justify-center gap-2 bg-accent text-white px-6 py-2.5 text-sm font-medium hover:bg-accent/90 transition-colors rounded-lg"
          >
            <Plus size={16} />
            Save
          </button>
        </form>
        {showSuccess && (
          <div className="mt-3 flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">
            <span className="font-medium">Expense recorded!</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Expense History */}
        <div className="lg:col-span-2 bg-card rounded-xl border border-border">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Expense History</h2>
            <div className="flex items-center gap-2">
              <Tag size={14} className="text-muted" />
              <select
                value={filterCategory ?? ""}
                onChange={(e) => setFilterCategory(e.target.value || null)}
                className="text-xs border border-border rounded-lg px-2 py-1.5 focus:border-primary focus:outline-none bg-card"
              >
                <option value="">All Categories</option>
                {expenseCategories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              {filterCategory && (
                <button onClick={() => setFilterCategory(null)} className="text-muted hover:text-foreground">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-border">
                <th className="p-4 font-medium">Date</th>
                <th className="p-4 font-medium">Description</th>
                <th className="p-4 font-medium">Category</th>
                <th className="p-4 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {mockExpenses
                .filter((e) => !filterCategory || e.category === filterCategory)
                .map((expense) => (
                <tr key={expense.id} className="hover:bg-surface/50 transition-colors">
                  <td className="p-4 text-sm text-muted whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <Calendar size={13} />
                      {expense.date}
                    </span>
                  </td>
                  <td className="p-4 text-sm font-medium text-foreground">{expense.description}</td>
                  <td className="p-4">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${getCategoryColor(expense.category)}`}>
                      {expense.category}
                    </span>
                  </td>
                  <td className="p-4 text-sm font-semibold text-right text-foreground">
                    {formatCurrency(expense.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Category Breakdown */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold text-foreground mb-4">Category Breakdown</h2>
          <div className="space-y-3">
            {categoryBreakdown.map((item) => (
              <div key={item.category}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-foreground">{item.category}</span>
                  <span className="text-sm font-medium text-foreground">{formatCurrency(item.total)}</span>
                </div>
                <div className="w-full bg-surface rounded-full h-2">
                  <div
                    className="bg-primary rounded-full h-2 transition-all"
                    style={{ width: `${(item.total / maxCategoryAmount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Total</span>
              <span className="text-sm font-bold text-foreground">
                {formatCurrency(mockExpenses.reduce((sum, e) => sum + e.amount, 0))}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
