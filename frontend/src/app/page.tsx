import type { Metadata } from "next";
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
  Globe,
  Calculator,
  Briefcase,
  Target,
} from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";
import { DashboardMockup } from "@/components/ui/DashboardMockup";

export const metadata: Metadata = {
  title: "Home - OneGemmy",
};

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="pt-28 pb-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[#1a1209] via-[#2b2118] to-[#3d2f22] overflow-hidden">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-8">
          {/* Left - Text */}
          <div className="w-full lg:w-1/2 text-left">
            <div className="inline-flex items-center gap-2 text-accent text-sm font-semibold mb-6 border-b-2 border-accent pb-1">
              <Zap size={15} />
              All-in-One Business Management Platform
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Run Your Business
              <br />
              <span className="text-white/60">From One Place</span>
            </h1>
            <p className="text-lg text-white/60 max-w-xl mb-8">
              OneGemmy brings sales, inventory, accounting, HR, projects, and CRM
              together in a single powerful platform. Stop juggling multiple tools
              — manage everything with OneGemmy.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mb-8">
              <a
                href="/register"
                className="bg-accent text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-accent/90 transition-colors inline-flex items-center justify-center gap-2"
              >
                Start Free Trial
                <ArrowRight size={20} />
              </a>
              <a
                href="#demo"
                className="border border-white/20 text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-white/5 transition-colors"
              >
                Watch Demo
              </a>
            </div>
            <div className="flex flex-wrap gap-6 text-white/60 text-sm">
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

          {/* Right - Dashboard Mockup */}
          <div className="w-full lg:w-1/2">
            <DashboardMockup />
          </div>
        </div>
      </section>

      {/* Feature Showcase — alternating text/screenshot per flagship module */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto space-y-24">
          {showcase.map((item, i) => (
            <div
              key={item.title}
              className={`flex flex-col ${i % 2 === 1 ? "lg:flex-row-reverse" : "lg:flex-row"} items-center gap-12`}
            >
              <div className="w-full lg:w-1/2">
                <div className="inline-flex items-center gap-2 text-accent text-sm font-semibold mb-4 border-b-2 border-accent pb-1">
                  <item.icon size={15} />
                  {item.eyebrow}
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                  {item.title}
                </h2>
                <p className="text-lg text-muted mb-6 leading-relaxed">
                  {item.description}
                </p>
                <ul className="space-y-3">
                  {item.points.map((p) => (
                    <li key={p} className="flex items-center gap-2.5 text-foreground/80">
                      <Check size={18} className="text-emerald-500 flex-shrink-0" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="w-full lg:w-1/2">
                <DashboardMockup highlight={item.highlight} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 text-accent text-sm font-semibold mb-4 border-b-2 border-accent pb-1">
              <Zap size={15} />
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
                className="bg-card p-6 rounded-xl border border-border hover:border-accent/40 hover:shadow-md transition-all group"
              >
                <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4 group-hover:bg-accent transition-colors">
                  <feature.icon
                    size={24}
                    className="text-accent group-hover:text-white transition-colors"
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
            <div className="inline-flex items-center gap-2 text-accent text-sm font-semibold mb-4 border-b-2 border-accent pb-1">
              <Layers size={15} />
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
                className="bg-card p-6 rounded-xl border border-border hover:border-accent/40 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
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
                          className="text-xs bg-surface text-foreground/70 px-3 py-1 rounded-md"
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
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 text-accent text-sm font-semibold mb-4 border-b-2 border-accent pb-1">
              <Globe size={15} />
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
                className={`p-6 rounded-xl border transition-colors ${
                  size.featured
                    ? "border-accent bg-accent/5 shadow-md"
                    : "border-border hover:border-accent/40"
                }`}
              >
                {size.featured && (
                  <div className="bg-accent text-white text-xs font-bold px-3 py-1 rounded-md inline-block mb-4">
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

      {/* Getting Started Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Up and Running in Minutes
            </h2>
            <p className="text-xl text-muted max-w-2xl mx-auto">
              No lengthy onboarding, no implementation team required.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {gettingStarted.map((step, i) => (
              <div key={step.title} className="text-center md:text-left">
                <div className="w-10 h-10 rounded-lg bg-accent text-white flex items-center justify-center font-bold text-lg mb-4 mx-auto md:mx-0">
                  {i + 1}
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">{step.title}</h3>
                <p className="text-muted text-sm leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[#1a1209] via-[#2b2118] to-[#3d2f22]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Transform Your Business?
          </h2>
          <p className="text-xl text-white/60 mb-10">
            Join thousands of businesses already using OneGemmy to manage their
            operations, boost sales, and grow faster.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="/register"
              className="bg-accent text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-accent/90 transition-colors inline-flex items-center justify-center gap-2"
            >
              Start Your Free Trial
              <ArrowRight size={20} />
            </a>
            <a
              href="/contact"
              className="border border-white/20 text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-white/5 transition-colors"
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

const showcase: {
  icon: typeof Target;
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  highlight: "Sales" | "Inventory" | "Accounting";
}[] = [
  {
    icon: Target,
    eyebrow: "Sales",
    title: "Close deals faster, never lose track of a lead",
    description:
      "A visual pipeline from first contact to closed deal, with quotes, commissions, and targets built in — so your whole sales team works from one source of truth.",
    points: ["Drag-and-drop pipeline", "Quotes & commissions", "Team targets & performance"],
    highlight: "Sales",
  },
  {
    icon: Package,
    eyebrow: "Inventory",
    title: "Know exactly what's in stock, everywhere",
    description:
      "Track stock across every warehouse in real time, with low-stock alerts and purchase orders that keep you ahead of demand instead of reacting to it.",
    points: ["Multi-warehouse tracking", "Low-stock alerts", "Purchase orders & transfers"],
    highlight: "Inventory",
  },
  {
    icon: Calculator,
    eyebrow: "Accounting",
    title: "Your books, always up to date",
    description:
      "Invoicing, expenses, and financial reports stay in sync with every sale and purchase automatically — no manual reconciliation, no surprises at month end.",
    points: ["Automated invoicing", "Expense tracking", "Real-time P&L"],
    highlight: "Accounting",
  },
];

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
    title: "Accounting & Finance",
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

const gettingStarted = [
  {
    title: "Create your account",
    description: "Sign up with your business name and email — no credit card required to start.",
  },
  {
    title: "Set up your business",
    description: "Add your products, team, and the modules you need. Import existing data or start fresh.",
  },
  {
    title: "Start managing",
    description: "Make your first sale, track your first shipment, run your first report — you're live.",
  },
];
