export function DashboardMockup() {
  const bars = [40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 100];
  return (
    <div className="relative">
      <div className="absolute -inset-6 bg-accent/10 blur-3xl" />

      <div className="relative bg-[#12100d] p-1.5 shadow-2xl">
        {/* Window chrome */}
        <div className="flex items-center gap-1.5 px-3 py-2.5">
          <div className="w-2 h-2 rounded-full bg-white/20" />
          <div className="w-2 h-2 rounded-full bg-white/20" />
          <div className="w-2 h-2 rounded-full bg-white/20" />
          <div className="flex-1 mx-3">
            <div className="bg-white/5 border border-white/10 px-3 py-1 text-[11px] text-white/40 text-center">
              app.onegemmy.com/dashboard
            </div>
          </div>
        </div>

        <div className="flex bg-surface">
          {/* Sidebar */}
          <div className="w-24 bg-[#12100d] p-2 hidden sm:block">
            <div className="w-6 h-6 bg-accent flex items-center justify-center mb-4">
              <div className="w-2.5 h-2.5 bg-white" />
            </div>
            <div className="space-y-1">
              {["Dashboard", "Sales", "Inventory", "Accounting", "HR"].map((item, i) => (
                <div
                  key={item}
                  className={`px-2 py-1.5 text-[10px] ${i === 0 ? "bg-accent text-white" : "text-white/35"}`}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 p-4 min-w-0">
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { label: "Revenue", value: "$48.5K" },
                { label: "Orders", value: "482" },
                { label: "Deals Won", value: "36" },
              ].map((s) => (
                <div key={s.label} className="bg-card border border-border p-2.5">
                  <div className="text-[9px] text-muted mb-1">{s.label}</div>
                  <div className="text-[13px] font-bold text-foreground">{s.value}</div>
                </div>
              ))}
            </div>
            <div className="bg-card border border-border p-3">
              <div className="flex items-end gap-1 h-20">
                {bars.map((h, i) => (
                  <div
                    key={i}
                    className={i >= bars.length - 3 ? "flex-1 bg-accent" : "flex-1 bg-border"}
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
