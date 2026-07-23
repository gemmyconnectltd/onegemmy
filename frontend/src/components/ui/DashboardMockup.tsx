export function DashboardMockup() {
  return (
    <div className="relative">
      {/* Glow */}
      <div className="absolute -inset-8 bg-white/10 rounded-3xl blur-3xl" />

      <div className="flex items-end justify-center gap-4 relative">
        {/* Desktop Monitor */}
        <div className="relative flex-shrink-0 w-[200px]">
          <div className="bg-foreground rounded-2xl p-1 shadow-2xl">
            <div className="bg-white rounded-xl overflow-hidden">
              <div className="flex items-center gap-1 px-2 py-1 bg-surface border-b border-border">
                <div className="flex gap-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                </div>
                <div className="flex-1 mx-1">
                  <div className="bg-white border border-border rounded px-1 py-0.5 text-[5px] text-muted text-center">
                    app.onegemmy.com/reports
                  </div>
                </div>
              </div>
              <div className="p-2 bg-surface min-h-[100px]">
                <div className="text-[6px] font-bold text-foreground mb-1.5">Analytics</div>
                <div className="grid grid-cols-2 gap-1 mb-2">
                  <div className="bg-white rounded-lg p-1.5 border border-border">
                    <div className="text-[5px] text-muted">Revenue</div>
                    <div className="text-[8px] font-bold text-foreground">$482K</div>
                  </div>
                  <div className="bg-white rounded-lg p-1.5 border border-border">
                    <div className="text-[5px] text-muted">Profit</div>
                    <div className="text-[8px] font-bold text-emerald-600">$264K</div>
                  </div>
                </div>
                <div className="bg-white rounded-lg p-1.5 border border-border">
                  <div className="flex items-end gap-0.5 h-10">
                    {[30, 50, 35, 70, 45, 80, 60, 75, 55, 85, 65, 88].map((h, i) => (
                      <div key={i} className="flex-1 rounded" style={{ height: `${h}%`, background: i >= 8 ? "#af9164" : "#e8e4de" }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Monitor stand */}
          <div className="h-3 bg-foreground rounded-b-xl mx-12" />
          <div className="h-1 bg-foreground/70 rounded mx-16" />
        </div>

        {/* Laptop - Main Dashboard */}
        <div className="relative flex-shrink-0 w-[240px]">
          <div className="bg-foreground rounded-2xl p-1 shadow-2xl">
            <div className="bg-white rounded-xl overflow-hidden">
              <div className="flex items-center gap-1.5 px-2 py-1.5 bg-surface border-b border-border">
                <div className="flex gap-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                </div>
                <div className="flex-1 mx-1">
                  <div className="bg-white border border-border rounded-lg px-1.5 py-0.5 text-[6px] text-muted text-center">
                    app.onegemmy.com/dashboard
                  </div>
                </div>
              </div>
              <div className="flex min-h-[140px]">
                <div className="w-14 bg-foreground p-1 rounded-bl-xl">
                  <div className="flex items-center gap-1 mb-2 px-0.5">
                    <div className="w-3 h-3 bg-primary flex items-center justify-center rounded-lg">
                      <div className="w-1.5 h-1.5 bg-white rounded" />
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    {["Dashboard", "Sales", "Stock", "Finance", "HR"].map((item, i) => (
                      <div key={item} className={`px-1.5 py-1 text-[5px] rounded-lg ${i === 0 ? "bg-white/10 text-white" : "text-white/40"}`}>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex-1 p-1.5 bg-surface">
                  <div className="grid grid-cols-2 gap-1 mb-1.5">
                    {[
                      { label: "Revenue", value: "$48.5K", color: "bg-primary" },
                      { label: "Deals", value: "48", color: "bg-emerald-500" },
                    ].map((s) => (
                      <div key={s.label} className="bg-white rounded-lg p-1.5 border border-border">
                        <div className="flex items-center gap-0.5 mb-0.5">
                          <div className={`w-1 h-1 rounded-full ${s.color}`} />
                          <span className="text-[5px] text-muted">{s.label}</span>
                        </div>
                        <div className="text-[9px] font-bold text-foreground">{s.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white rounded-lg p-1.5 border border-border">
                    <div className="flex items-end gap-0.5 h-12">
                      {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95].map((h, i) => (
                        <div key={i} className="flex-1 rounded" style={{ height: `${h}%`, background: i === 8 ? "#af9164" : "#e8e4de" }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="h-1.5 bg-foreground rounded-b-2xl mx-8" />
        </div>

        {/* POS Terminal */}
        <div className="relative flex-shrink-0 w-[70px]">
          <div className="bg-foreground rounded-2xl p-1 shadow-2xl">
            <div className="bg-white rounded-xl overflow-hidden">
              <div className="px-1.5 py-1 bg-surface border-b border-border">
                <span className="text-[5px] font-bold text-foreground block text-center">POS</span>
              </div>
              <div className="p-1 bg-surface min-h-[100px]">
                <div className="bg-white rounded-lg p-1 border border-border mb-1">
                  <div className="text-[5px] text-muted">Total</div>
                  <div className="text-[8px] font-bold text-foreground">$24.50</div>
                </div>
                <div className="space-y-0.5">
                  {[
                    { name: "Widget", qty: 2, price: "$18" },
                    { name: "Gadget", qty: 1, price: "$6.50" },
                  ].map((item, i) => (
                    <div key={i} className="bg-white rounded p-1 border border-border flex justify-between">
                      <span className="text-[5px] text-foreground">{item.name} x{item.qty}</span>
                      <span className="text-[5px] font-medium text-foreground">{item.price}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-primary rounded-lg p-1 mt-1 text-center">
                  <span className="text-[5px] font-bold text-white">Pay Now</span>
                </div>
              </div>
            </div>
          </div>
          {/* Terminal stand */}
          <div className="h-2 bg-foreground rounded-b-xl mx-3" />
        </div>

        {/* Tablet */}
        <div className="relative flex-shrink-0 w-[120px]">
          <div className="bg-foreground rounded-2xl p-1 shadow-2xl">
            <div className="bg-white rounded-xl overflow-hidden">
              <div className="px-2 py-1 bg-surface border-b border-border flex items-center justify-between">
                <span className="text-[6px] font-bold text-foreground">Sales</span>
                <div className="w-1 h-1 rounded-full bg-emerald-500" />
              </div>
              <div className="p-1.5 bg-surface min-h-[100px]">
                <div className="space-y-1">
                  {[
                    { name: "Acme Corp", value: "$12K", stage: "Won" },
                    { name: "Beta LLC", value: "$8.5K", stage: "Active" },
                    { name: "Charlie", value: "$45K", stage: "Proposal" },
                  ].map((deal, i) => (
                    <div key={i} className="bg-white rounded-lg p-1.5 border border-border flex items-center justify-between">
                      <div>
                        <div className="text-[6px] font-medium text-foreground">{deal.name}</div>
                        <div className="text-[5px] text-muted">{deal.value}</div>
                      </div>
                      <span className={`text-[4px] px-1 py-0.5 rounded font-medium ${
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
        <div className="relative flex-shrink-0 w-[60px]">
          <div className="bg-foreground rounded-2xl p-0.5 shadow-2xl">
            <div className="bg-white rounded-xl overflow-hidden">
              <div className="px-1 py-0.5 bg-surface border-b border-border">
                <span className="text-[5px] font-bold text-foreground block text-center">Stock</span>
              </div>
              <div className="p-1 bg-surface min-h-[80px]">
                <div className="space-y-0.5">
                  {[
                    { name: "Widget Pro", stock: 245 },
                    { name: "Gadget", stock: 12 },
                    { name: "Component", stock: 890 },
                  ].map((p, i) => (
                    <div key={i} className="bg-white rounded p-1 border border-border">
                      <div className="text-[5px] font-medium text-foreground">{p.name}</div>
                      <div className="text-[4px] text-muted">Qty: {p.stock}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="absolute top-1 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-foreground rounded-full" />
        </div>
      </div>
    </div>
  );
}
