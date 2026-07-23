import { Plus, FolderKanban, Clock, CheckCircle2, AlertCircle } from "lucide-react";

const projects = [
  { name: "Website Redesign", client: "Internal", status: "In Progress", progress: 65, deadline: "2024-03-01", budget: "$12,000" },
  { name: "Mobile App MVP", client: "Acme Corp", status: "In Progress", progress: 40, deadline: "2024-04-15", budget: "$45,000" },
  { name: "CRM Integration", client: "Beta LLC", status: "Planning", progress: 15, deadline: "2024-05-01", budget: "$28,000" },
  { name: "Data Migration", client: "Charlie Inc", status: "Completed", progress: 100, deadline: "2024-01-10", budget: "$8,500" },
  { name: "Security Audit", client: "Internal", status: "In Progress", progress: 80, deadline: "2024-02-20", budget: "$5,000" },
];

export default function ProjectsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Projects</h1>
          <p className="text-sm text-muted mt-1">Track projects, tasks, and milestones</p>
        </div>
        <button className="flex items-center gap-2 bg-accent text-white px-4 py-2.5 text-sm font-medium hover:bg-accent/90 transition-colors">
          <Plus size={16} />
          New Project
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Projects", value: "12", icon: FolderKanban, color: "text-primary" },
          { label: "In Progress", value: "5", icon: Clock, color: "text-secondary" },
          { label: "Completed", value: "6", icon: CheckCircle2, color: "text-emerald-600" },
          { label: "At Risk", value: "1", icon: AlertCircle, color: "text-accent" },
        ].map((stat) => (
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

      <div className="grid gap-4">
        {projects.map((project, i) => (
          <div key={i} className="bg-white rounded-xl border border-border p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-foreground">{project.name}</h3>
                <p className="text-sm text-muted mt-0.5">{project.client}</p>
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                project.status === "Completed" ? "bg-emerald-50 text-emerald-600" :
                project.status === "In Progress" ? "bg-foreground/10 text-foreground" :
                "bg-surface text-muted"
              }`}>
                {project.status}
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted">
              <span>Deadline: {project.deadline}</span>
              <span>Budget: {project.budget}</span>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted">Progress</span>
                <span className="text-xs font-medium text-foreground">{project.progress}%</span>
              </div>
              <div className="w-full bg-surface rounded-full h-2">
                <div
                  className={`rounded-full h-2 transition-all ${
                    project.progress === 100 ? "bg-emerald-500" : "bg-foreground"
                  }`}
                  style={{ width: `${project.progress}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
