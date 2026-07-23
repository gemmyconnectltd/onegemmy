export function DashboardMockup() {
  return (
    <div className="relative">
      {/* Glow */}
      <div className="absolute -inset-6 bg-white/10 rounded-3xl blur-3xl" />

      <div className="flex items-end justify-center gap-3 relative">
        {/* Laptop */}
        <div className="relative flex-shrink-0 w-[280px]">
          <div className="bg-foreground rounded-2xl p-1 shadow-2xl">
            <div className="bg-white rounded-xl overflow-hidden">
              <div className="flex items-center gap-1.5 px-3 py-2 bg-surface border-b border-border">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
                <div className="flex-1 mx-2">
                  <div className="bg-white border border-border rounded-lg px-2 py-0.5 text-[7px] text-muted text-center">
                    app.onegemmy.com
                  </div>
                </div>
              </div>
              <div className="flex min-h-[160px]">
                <div className="w-16 bg-foreground p-1.5 rounded-bl-xl">
                  <div className="flex items-center gap-1 mb-3 px-1">
                    <div className="w-4 h-4 bg-primary flex items-center justify-center rounded-lg">
                      <div className="w-2 h-2 bg-white rounded" />
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    {["Dashboard", "Sales", "Stock", "Finance", "HR"].map((item, i) => (
                      <div key={item} className={`px-2 py-1.5 text-[6px] rounded-lg ${i === 0 ? "bg-white/10 text-white" : "text-white/40"}`}>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex-1 p-2 bg-surface">
                  <div className="grid grid-cols-2 gap-1.5 mb-2">
                    {[
                      { label: "Revenue", value: "$48.5K", color: "bg-primary" },
                      { label: "Deals", value: "48", color: "bg-emerald-500" },
                    ].map((s) => (
                      <div key={s.label} className="bg-white rounded-xl p-2 border border-border">
                        <div className="flex items-center gap-1 mb-1">
                          <div className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
                          <span className="text-[6px] text-muted">{s.label}</span>
                        </div>
                        <div className="text-[10px] font-bold text-foreground">{s.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white rounded-xl p-2 border border-border">
                    <div className="flex items-end gap-0.5 h-14">
                      {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95].map((h, i) => (
                        <div key={i} className="flex-1 rounded-lg" style={{ height: `${h}%`, background: i === 8 ? "#af9164" : "#e8e4de" }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="h-2 bg-foreground rounded-b-2xl mx-10" />
        </div>

        {/* Tablet */}
        <div className="relative flex-shrink-0 w-[140px] -ml-4">
          <div className="bg-foreground rounded-2xl p-1 shadow-2xl">
            <div className="bg-white rounded-xl overflow-hidden">
              <div className="px-2 py-1.5 bg-surface border-b border-border flex items-center justify-between">
                <span className="text-[7px] font-bold text-foreground">Sales</span>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </div>
              <div className="p-2 bg-surface min-h-[120px]">
                <div className="space-y-1.5">
                  {[
                    { name: "Acme Corp", value: "$12K", stage: "Won" },
                    { name: "Beta LLC", value: "$8.5K", stage: "Active" },
                    { name: "Charlie", value: "$45K", stage: "Proposal" },
                  ].map((deal, i) => (
                    <div key={i} className="bg-white rounded-xl p-2 border border-border flex items-center justify-between">
                      <div>
                        <div className="text-[7px] font-medium text-foreground">{deal.name}</div>
                        <div className="text-[6px] text-muted">{deal.value}</div>
                      </div>
                      <span className={`text-[5px] px-1.5 py-0.5 rounded-lg font-medium ${
                        deal.stage === "Won" ? "bg-emerald-50 text-emerald-600" :
                        deal.stage === "Active" ? "bg-primary/10 text-primary" :
                        "bg-foreground/5 text-foreground/70"
                      }`}>{deal.stage}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Phone */}
        <div className="relative flex-shrink-0 w-[80px] -ml-3">
          <div className="bg-foreground rounded-2xl p-1 shadow-2xl">
            <div className="bg-white rounded-xl overflow-hidden">
              <div className="px-1.5 py-1 bg-surface border-b border-border">
                <span className="text-[6px] font-bold text-foreground block text-center">Stock</span>
              </div>
              <div className="p-1.5 bg-surface min-h-[100px]">
                <div className="space-y-1">
                  {[
                    { name: "Widget Pro", stock: 245 },
                    { name: "Gadget", stock: 12 },
                    { name: "Component", stock: 890 },
                  ].map((p, i) => (
                    <div key={i} className="bg-white rounded-lg p-1.5 border border-border">
                      <div className="text-[6px] font-medium text-foreground">{p.name}</div>
                      <div className="text-[5px] text-muted">Qty: {p.stock}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-6 h-1 bg-foreground rounded-full" />
        </div>
      </div>
    </div>
  );
}
