import {
  BarChart3,
  Handshake,
  Package,
  FileText,
  Users,
  TrendingUp,
  Check,
  ArrowRight,
  Layers,
  Zap,
  Shield,
  Globe,
  LineChart,
  Clock,
  Building2,
  FileSpreadsheet,
  Calculator,
  Briefcase,
  Target,
  Settings,
} from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[#2b2118] via-primary to-[#c4a77a]">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm text-white px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Zap size={16} />
            All-in-One Business Management Platform
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
            Run Your Business
            <br />
            <span className="text-white/80">From One Place</span>
          </h1>
          <p className="text-xl text-white/70 max-w-3xl mx-auto mb-10">
            OneGemmy brings sales, inventory, finance, HR, projects, and CRM
            together in a single powerful platform. Stop juggling multiple tools
            — manage everything with OneGemmy.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/register"
              className="bg-white text-primary px-8 py-4 rounded-lg font-bold text-lg hover:bg-surface transition-colors inline-flex items-center justify-center gap-2 shadow-xl"
            >
              Start Free Trial
              <ArrowRight size={20} />
            </a>
            <a
              href="#demo"
              className="border-2 border-white/30 text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-white/10 transition-colors"
            >
              Watch Demo
            </a>
          </div>
          <div className="mt-16 flex flex-wrap justify-center gap-8 text-white/70 text-sm">
            <div className="flex items-center gap-2">
              <Check size={18} className="text-emerald-400" />
              No credit card required
            </div>
            <div className="flex items-center gap-2">
              <Check size={18} className="text-emerald-400" />
              Free for small teams
            </div>
            <div className="flex items-center gap-2">
              <Check size={18} className="text-emerald-400" />
              Setup in 30 minutes
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-4">
              <Zap size={16} />
              Powerful Features
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Everything You Need to Run Your Business
            </h2>
            <p className="text-xl text-muted max-w-2xl mx-auto">
              One powerful platform replaces multiple tools. Save time, reduce
              errors, and get a complete view of your business.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="p-6 rounded-xl border border-border hover:border-primary/30 hover:shadow-lg transition-all group"
              >
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-primary transition-colors">
                  <feature.icon
                    size={24}
                    className="text-primary group-hover:text-white transition-colors"
                  />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-muted text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Modules Section */}
      <section id="modules" className="py-20 px-4 sm:px-6 lg:px-8 bg-surface">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-4">
              <Layers size={16} />
              Complete Modules
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Powerful Modules for Every Department
            </h2>
            <p className="text-xl text-muted max-w-2xl mx-auto">
              Each module is designed to handle a specific area of your business
              with depth and simplicity.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {modules.map((module) => (
              <div
                key={module.title}
                className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow border border-border"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center flex-shrink-0">
                    <module.icon size={24} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-foreground mb-2">
                      {module.title}
                    </h3>
                    <p className="text-muted text-sm mb-4 leading-relaxed">
                      {module.description}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {module.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs bg-surface text-foreground/70 px-3 py-1"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Business Size Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-accent/10 text-accent px-4 py-2 rounded-full text-sm font-medium mb-4">
              <Globe size={16} />
              Scalable Solutions
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Built for Every Business Size
            </h2>
            <p className="text-xl text-muted max-w-2xl mx-auto">
              Whether you&apos;re a solo entrepreneur or a large enterprise,
              OneGemmy scales with you.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {businessSizes.map((size) => (
              <div
                key={size.title}
                className={`rounded-xl p-6 border-2 transition-all ${
                  size.featured
                    ? "border-primary bg-primary/5 shadow-lg scale-105"
                    : "border-border hover:border-primary/30"
                }`}
              >
                {size.featured && (
                  <div className="bg-primary text-white text-xs font-bold px-3 py-1 rounded-full inline-block mb-4">
                    MOST POPULAR
                  </div>
                )}
                <h3 className="text-2xl font-bold text-foreground mb-2">
                  {size.title}
                </h3>
                <p className="text-muted text-sm mb-4">{size.subtitle}</p>
                <ul className="space-y-3">
                  {size.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-foreground/70 text-sm"
                    >
                      <Check size={16} className="text-emerald-500 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8" style={{ background: "var(--sidebar)" }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {stats.map((stat) => (
              <div key={stat.label}>
                <div className="text-4xl md:text-5xl font-bold text-white mb-2">
                  {stat.value}
                </div>
                <div className="text-white/50 text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[#2b2118] to-primary">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Transform Your Business?
          </h2>
          <p className="text-xl text-white/70 mb-10">
            Join thousands of businesses already using OneGemmy to manage their
            operations, boost sales, and grow faster.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/register"
              className="bg-white text-primary px-8 py-4 rounded-lg font-bold text-lg hover:bg-surface transition-colors inline-flex items-center justify-center gap-2"
            >
              Start Your Free Trial
              <ArrowRight size={20} />
            </a>
            <a
              href="/contact"
              className="border-2 border-white/30 text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-white/10 transition-colors"
            >
              Contact Sales
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

const features = [
  {
    icon: BarChart3,
    title: "Real-time Dashboard",
    description:
      "See your entire business at a glance. Revenue, expenses, sales pipeline, stock levels — all updated in real-time.",
  },
  {
    icon: Handshake,
    title: "Sales Pipeline",
    description:
      "Visual drag-and-drop pipeline to track every deal from lead to close. Never lose track of an opportunity.",
  },
  {
    icon: Package,
    title: "Inventory Control",
    description:
      "Track stock across multiple warehouses with barcode scanning, low-stock alerts, and purchase orders.",
  },
  {
    icon: FileText,
    title: "Invoicing & Payments",
    description:
      "Create professional invoices, track payments, and manage expenses. Get paid faster with automated reminders.",
  },
  {
    icon: Users,
    title: "HR & People Management",
    description:
      "Manage employees, attendance, leave, and performance reviews. Keep your team organized and productive.",
  },
  {
    icon: TrendingUp,
    title: "Powerful Analytics",
    description:
      "Generate custom reports, track KPIs, and get insights that help you make smarter business decisions.",
  },
];

const modules = [
  {
    icon: Target,
    title: "Sales Management",
    description:
      "Complete sales lifecycle from leads to orders. Pipeline, quotes, commissions, targets, and analytics.",
    tags: ["Pipeline", "Leads", "Quotes", "Orders", "Commissions", "Targets"],
  },
  {
    icon: Package,
    title: "Inventory & Stock",
    description:
      "Multi-warehouse stock tracking with adjustments, transfers, purchase orders, and physical stock takes.",
    tags: [
      "Stock Levels",
      "Warehouses",
      "Transfers",
      "Purchase Orders",
      "Stock Takes",
    ],
  },
  {
    icon: Calculator,
    title: "Finance & Accounting",
    description:
      "Invoicing, expenses, revenue tracking, financial reports, tax calculations, and budget management.",
    tags: ["Invoices", "Expenses", "P&L", "Budgets", "Tax"],
  },
  {
    icon: Users,
    title: "Human Resources",
    description:
      "Employee directory, attendance tracking, leave management, performance reviews, and document storage.",
    tags: [
      "Employees",
      "Attendance",
      "Leave",
      "Performance",
      "Documents",
    ],
  },
  {
    icon: Briefcase,
    title: "Project Management",
    description:
      "Plan, execute, and track projects with Kanban boards, Gantt charts, time tracking, and collaboration.",
    tags: [
      "Kanban",
      "Gantt",
      "Tasks",
      "Time Tracking",
      "Collaboration",
    ],
  },
  {
    icon: Handshake,
    title: "CRM",
    description:
      "Build and maintain customer relationships with contact profiles, interaction history, and deal tracking.",
    tags: [
      "Contacts",
      "Deals",
      "Interactions",
      "Follow-ups",
      "Segmentation",
    ],
  },
];

const businessSizes = [
  {
    title: "Small Business",
    subtitle: "1 - 10 employees",
    featured: false,
    features: [
      "Simple dashboard with key metrics",
      "Basic sales pipeline",
      "Single warehouse stock tracking",
      "Simple invoicing",
      "Employee directory",
      "Basic reports",
      "Free / Low-cost plan",
      "Setup in 30 minutes",
    ],
  },
  {
    title: "Medium Business",
    subtitle: "10 - 500 employees",
    featured: true,
    features: [
      "Multi-department dashboards",
      "Custom pipelines & targets",
      "Multi-warehouse with transfers",
      "Budget management & multi-currency",
      "Performance reviews & leave policies",
      "Custom report builder",
      "Team collaboration tools",
      "Priority support",
    ],
  },
  {
    title: "Large Enterprise",
    subtitle: "500+ employees",
    featured: false,
    features: [
      "Multi-entity/branch dashboards",
      "Complex approval workflows",
      "WMS & EDI integrations",
      "Intercompany transactions",
      "Multi-company HR & compliance",
      "Advanced analytics & forecasting",
      "SSO/SAML & API management",
      "Dedicated support engineer",
    ],
  },
];

const stats = [
  { value: "10K+", label: "Businesses" },
  { value: "50K+", label: "Users" },
  { value: "99.9%", label: "Uptime" },
  { value: "24/7", label: "Support" },
];
