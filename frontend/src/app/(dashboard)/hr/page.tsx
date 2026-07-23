import { Users, UserPlus, Calendar, Clock } from "lucide-react";

const stats = [
  { label: "Total Employees", value: "24", icon: Users, color: "text-primary" },
  { label: "New Hires", value: "3", icon: UserPlus, color: "text-emerald-600" },
  { label: "On Leave", value: "2", icon: Calendar, color: "text-secondary" },
  { label: "Avg. Hours", value: "40.2", icon: Clock, color: "text-accent" },
];

const employees = [
  { name: "John Doe", role: "Admin", department: "Management", status: "Active", email: "john@gemmyconnect.com" },
  { name: "Sarah Miller", role: "Sales Lead", department: "Sales", status: "Active", email: "sarah@gemmyconnect.com" },
  { name: "Mike Roberts", role: "Developer", department: "Engineering", status: "Active", email: "mike@gemmyconnect.com" },
  { name: "Emma Wilson", role: "Designer", department: "Design", status: "On Leave", email: "emma@gemmyconnect.com" },
  { name: "Chris Brown", role: "Accountant", department: "Finance", status: "Active", email: "chris@gemmyconnect.com" },
];

export default function HRPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Human Resources</h1>
          <p className="text-sm text-muted mt-1">Manage your team and HR operations</p>
        </div>
        <button className="flex items-center gap-2 bg-accent text-white px-4 py-2.5 text-sm font-medium hover:bg-accent/90 transition-colors">
          <UserPlus size={16} />
          Add Employee
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl p-5 border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-foreground/5 flex items-center justify-center">
                <stat.icon size={20} className={stat.color} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-border">
        <div className="p-5 border-b border-border">
          <h2 className="font-bold text-foreground">Team Members</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-muted border-b border-border">
              <th className="p-4 font-medium">Name</th>
              <th className="p-4 font-medium">Role</th>
              <th className="p-4 font-medium">Department</th>
              <th className="p-4 font-medium">Email</th>
              <th className="p-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {employees.map((emp, i) => (
              <tr key={i} className="hover:bg-surface/50 transition-colors">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-bold text-foreground">
                      {emp.name.split(" ").map(n => n[0]).join("")}
                    </div>
                    <span className="text-sm font-medium text-foreground">{emp.name}</span>
                  </div>
                </td>
                <td className="p-4 text-sm text-foreground/70">{emp.role}</td>
                <td className="p-4 text-sm text-foreground/70">{emp.department}</td>
                <td className="p-4 text-sm text-muted">{emp.email}</td>
                <td className="p-4">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    emp.status === "Active" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                  }`}>
                    {emp.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
