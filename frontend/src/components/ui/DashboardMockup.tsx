export function DashboardMockup() {
  return (
    <div className="relative mx-auto max-w-6xl mt-16">
      {/* Glow effect */}
      <div className="absolute -inset-8 bg-gradient-to-r from-white/10 via-white/5 to-white/10 rounded-3xl blur-3xl" />

      <div className="flex items-end justify-center gap-6 relative">
        {/* Laptop - Main Dashboard */}
        <div className="relative flex-shrink-0">
          <div className="bg-foreground rounded-t-xl p-1 shadow-2xl">
            <div className="bg-white rounded-t-lg overflow-hidden">
              {/* Browser bar */}
              <div className="flex items-center gap-2 px-3 py-2 bg-surface border-b border-border">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
                <div className="flex-1 mx-2">
                  <div className="bg-white border border-border rounded px-2 py-0.5 text-[8px] text-muted text-center">
                    app.onegemmy.com/dashboard
                  </div>
                </div>
              </div>
              {/* Dashboard */}
              <div className="flex min-h-[240px]">
                <div className="w-28 bg-foreground p-2 hidden sm:block">
                  <div className="flex items-center gap-1.5 mb-4 px-1">
                    <div className="w-5 h-5 bg-primary flex items-center justify-center rounded">
                      <div className="w-2 h-2 bg-white rounded-sm" />
                    </div>
                    <span className="text-white text-[8px] font-bold">OneGemmy</span>
                  </div>
                  <div className="space-y-0.5">
                    {["Dashboard", "Sales", "Stock", "Finance", "HR"].map((item, i) => (
                      <div key={item} className={`px-2 py-1.5 text-[7px] rounded ${i === 0 ? "bg-white/10 text-white font-medium" : "text-white/40"}`}>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex-1 p-3 bg-surface">
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[
                      { label: "Revenue", value: "$48.5K", color: "bg-primary" },
                      { label: "Deals", value: "48", color: "bg-emerald-500" },
                      { label: "Products", value: "1,284", color: "bg-amber-500" },
                    ].map((s) => (
                      <div key={s.label} className="bg-white rounded p-2 border border-border">
                        <div className="flex items-center gap-1 mb-1">
                          <div className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
                          <span className="text-[7px] text-muted">{s.label}</span>
                        </div>
                        <div className="text-xs font-bold text-foreground">{s.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white rounded p-2 border border-border">
                    <div className="text-[8px] font-bold text-foreground mb-2">Revenue</div>
                    <div className="flex items-end gap-0.5 h-16">
                      {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 88].map((h, i) => (
                        <div key={i} className="flex-1 rounded-sm" style={{ height: `${h}%`, background: i === 9 ? "#af9164" : "#e8e4de" }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Laptop base */}
          <div className="h-2 bg-foreground rounded-b-xl mx-8" />
          <div className="h-1 bg-foreground/80 rounded-b mx-16" />
        </div>

        {/* Tablet - Sales */}
        <div className="relative flex-shrink-0">
          <div className="bg-foreground rounded-xl p-1.5 shadow-2xl">
            <div className="bg-white rounded-lg overflow-hidden">
              <div className="px-2 py-1.5 bg-surface border-b border-border flex items-center justify-between">
                <span className="text-[8px] font-bold text-foreground">Sales Pipeline</span>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </div>
              <div className="p-2 bg-surface min-h-[180px]">
                <div className="grid grid-cols-4 gap-1 mb-2">
                  {[
                    { name: "Leads", count: 24, color: "#b3b6b7" },
                    { name: "Qualified", count: 18, color: "#af9164" },
                    { name: "Proposal", count: 12, color: "#6f1a07" },
                    { name: "Won", count: 15, color: "#10B981" },
                  ].map((s) => (
                    <div key={s.name} className="bg-white rounded p-1.5 border border-border">
                      <div className="flex items-center gap-1 mb-1">
                        <div className="w-1 h-1 rounded-full" style={{ background: s.color }} />
                        <span className="text-[6px] text-muted">{s.name}</span>
                      </div>
                      <div className="text-[10px] font-bold text-foreground">{s.count}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  {[
                    { name: "Acme Corp", value: "$12K", stage: "Won" },
                    { name: "Beta LLC", value: "$8.5K", stage: "Active" },
                    { name: "Charlie Inc", value: "$45K", stage: "Proposal" },
                    { name: "Delta Co", value: "$6.2K", stage: "Won" },
                  ].map((deal, i) => (
                    <div key={i} className="bg-white rounded p-1.5 border border-border flex items-center justify-between">
                      <div>
                        <div className="text-[8px] font-medium text-foreground">{deal.name}</div>
                        <div className="text-[7px] text-muted">{deal.value}</div>
                      </div>
                      <span className={`text-[6px] px-1 py-0.5 rounded font-medium ${
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

        {/* Phone - Stock */}
        <div className="relative flex-shrink-0">
          <div className="bg-foreground rounded-2xl p-1.5 shadow-2xl w-32">
            <div className="bg-white rounded-xl overflow-hidden">
              <div className="px-2 py-1 bg-surface border-b border-border flex items-center justify-center">
                <span className="text-[7px] font-bold text-foreground">Stock & Inventory</span>
              </div>
              <div className="p-1.5 bg-surface min-h-[150px]">
                <div className="grid grid-cols-2 gap-1 mb-2">
                  <div className="bg-white rounded p-1.5 border border-border">
                    <div className="text-[6px] text-muted">Products</div>
                    <div className="text-[9px] font-bold text-foreground">1,284</div>
                  </div>
                  <div className="bg-white rounded p-1.5 border border-border">
                    <div className="text-[6px] text-muted">Low Stock</div>
                    <div className="text-[9px] font-bold text-accent">23</div>
                  </div>
                </div>
                <div className="space-y-1">
                  {[
                    { name: "Widget Pro", stock: 245, status: "OK" },
                    { name: "Gadget Std", stock: 12, status: "Low" },
                    { name: "Component A", stock: 890, status: "OK" },
                  ].map((p, i) => (
                    <div key={i} className="bg-white rounded p-1.5 border border-border">
                      <div className="flex justify-between items-center">
                        <div className="text-[7px] font-medium text-foreground">{p.name}</div>
                        <span className={`text-[5px] px-1 rounded font-medium ${
                          p.status === "OK" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                        }`}>{p.status}</span>
                      </div>
                      <div className="text-[6px] text-muted mt-0.5">Qty: {p.stock}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {/* Phone notch */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-foreground rounded-full" />
        </div>
      </div>
    </div>
  );
}
