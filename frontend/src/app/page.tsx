import type { Metadata } from "next";
import {
  BarChart3,
  Handshake,
  Store,
  Package,
  FileText,
  Users,
  Check,
  ArrowRight,
  Zap,
  Calculator,
  Wrench,
  Factory,
  ClipboardList,
  Languages,
  Hexagon,
  Triangle,
  Circle,
  Square,
  Pentagon,
  KeyRound,
  ShieldCheck,
  Lock,
} from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";
import { AppScreenshot } from "@/components/ui/AppScreenshot";
import { PhoneScreenshot } from "@/components/ui/PhoneScreenshot";
import { AppJourney } from "@/components/ui/AppJourney";

export const metadata: Metadata = {
  title: "Home - OneGemmy",
};

const DOT_GRID = {
  backgroundImage: "radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-28 pb-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[#1a1209] via-[#2b2118] to-[#3d2f22] overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_70%)]" style={DOT_GRID} />
        <div className="relative max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-8">
          {/* Left - Text */}
          <div className="w-full lg:w-1/2 text-left">
            <div className="inline-flex items-center gap-2 text-[#e8a488] text-sm font-semibold mb-6 border-b-2 border-[#e8a488] pb-1">
              <Zap size={15} />
              Built for Growing Businesses
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Run Your Whole Business
              <br />
              <span className="text-white/60">From One Place</span>
            </h1>
            <p className="text-lg text-white/60 max-w-xl mb-8">
              Sales, stock, books, and your team, in one place — with the
              spreadsheets and side-notebooks finally put away for good.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mb-8">
              <a
                href="/register"
                className="bg-[#6f1a07] text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-[#591506] transition-colors inline-flex items-center justify-center gap-2"
              >
                Start Free Trial
                <ArrowRight size={20} />
              </a>
              <a
                href="#features"
                className="border border-white/20 text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-white/5 transition-colors"
              >
                Explore Features
              </a>
            </div>
            <div className="flex flex-wrap gap-6 text-white/60 text-sm">
              <div className="flex items-center gap-2">
                <Check size={18} className="text-emerald-400" />
                No credit card required
              </div>
              <div className="flex items-center gap-2">
                <Check size={18} className="text-emerald-400" />
                Free plan for small teams
              </div>
              <div className="flex items-center gap-2">
                <Check size={18} className="text-emerald-400" />
                Setup in 30 minutes
              </div>
            </div>
          </div>

          {/* Right - Web dashboard, with the mobile app layered in front to show they work together */}
          <div className="relative w-full lg:w-1/2 pb-10 pl-8 sm:pb-16 sm:pl-16">
            <div className="lg:-rotate-2 transition-transform hover:rotate-0 duration-500">
              <AppScreenshot
                src="/screenshots/dashboard.png"
                alt="OneGemmy web dashboard showing this year's sales, recent orders, and top products"
                path="dashboard"
                priority
              />
            </div>
            <div className="absolute bottom-0 left-0 rotate-3 hover:rotate-0 transition-transform duration-500 z-10">
              <PhoneScreenshot
                src="/screenshots/mobile-home.png"
                alt="OneGemmy mobile app home screen showing today's sales, in sync with the same account"
                width={130}
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* App in Use — animated walkthrough of a day in OneGemmy, real screenshots */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-surface">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-[#6f1a07] uppercase tracking-wide mb-3">
              See it in action
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              A day with OneGemmy
            </h2>
            <p className="text-xl text-muted max-w-2xl mx-auto">
              Same real account, same real data, followed through an ordinary
              business day.
            </p>
          </div>
          <AppJourney />
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
                <div className="inline-flex items-center gap-2 text-[#6f1a07] text-sm font-semibold mb-4 border-b-2 border-[#6f1a07] pb-1">
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
              <div className={`w-full lg:w-1/2 ${i % 2 === 1 ? "lg:rotate-2" : "lg:-rotate-1"}`}>
                <AppScreenshot src={item.screenshot} alt={item.screenshotAlt} path={item.path} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features Section — editorial list, not another card grid */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-[320px_1fr] gap-x-16 gap-y-10">
          <div>
            <p className="text-sm font-semibold text-[#6f1a07] uppercase tracking-wide mb-3">
              What you get
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Six things spreadsheets can&apos;t do
            </h2>
            <p className="text-muted leading-relaxed">
              None of this is exotic. It&apos;s just the stuff a growing
              business needs, working correctly, in one app instead of five.
            </p>
          </div>

          <div className="divide-y divide-border">
            {features.map((feature, i) => (
              <div key={feature.title} className={`py-6 flex gap-5 ${i === 0 ? "pt-0" : ""}`}>
                <span className="hidden sm:block text-sm font-mono text-muted/40 pt-0.5 w-6 shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <feature.icon size={20} className="text-[#6f1a07] mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-bold text-foreground mb-1">{feature.title}</h3>
                  <p className="text-muted text-sm leading-relaxed">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Modules Section — dense catalog list, not more cards */}
      <section id="modules" className="py-24 px-4 sm:px-6 lg:px-8 bg-surface">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-xl mb-12">
            <p className="text-sm font-semibold text-[#6f1a07] uppercase tracking-wide mb-3">
              The full picture
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              One login, every department
            </h2>
            <p className="text-muted leading-relaxed">
              Eight modules, built to work together instead of as bolted-on
              add-ons. Turn on what you need; leave the rest off.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-x-12">
            {modules.map((module, i) => (
              <div
                key={module.title}
                className={`flex items-start gap-4 py-6 border-t border-border ${i < 2 ? "md:pt-0 md:border-t-0" : ""}`}
              >
                <module.icon size={22} className="text-[#6f1a07] mt-1 shrink-0" />
                <div>
                  <h3 className="font-bold text-foreground mb-1.5">{module.title}</h3>
                  <p className="text-muted text-sm mb-2 leading-relaxed">{module.description}</p>
                  <p className="text-xs text-muted/60 tracking-wide">{module.tags.join(" · ")}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Web + Mobile Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-[#1a1209] overflow-hidden">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-16">
          <div className="w-full lg:w-1/2">
            <p className="text-sm font-semibold text-[#e8a488] uppercase tracking-wide mb-3">
              Web + mobile
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Run the back office. Sell from the counter.
            </h2>
            <p className="text-lg text-white/60 mb-8 leading-relaxed">
              The full dashboard lives on the web for whoever manages the
              business. A dedicated mobile app handles checkout, stock, and
              daily sales for whoever&apos;s on the floor — same data, synced
              in real time on both.
            </p>
            <ul className="space-y-3">
              {["Mobile checkout, restocking, and expenses", "Changes on mobile show up on the web instantly", "Built for the phone your staff already carries"].map((p) => (
                <li key={p} className="flex items-center gap-2.5 text-white/80">
                  <Check size={18} className="text-emerald-400 flex-shrink-0" />
                  {p}
                </li>
              ))}
            </ul>
          </div>

          <div className="w-full lg:w-1/2 flex justify-center items-end gap-4">
            <PhoneScreenshot
              src="/screenshots/mobile-home.png"
              alt="OneGemmy mobile app home screen showing today's sales and quick actions"
              className="-rotate-3 relative z-10"
            />
            <PhoneScreenshot
              src="/screenshots/mobile-pos.png"
              alt="OneGemmy mobile point of sale screen showing the product list for checkout"
              className="rotate-3 -ml-16 mt-8 hidden sm:block"
            />
          </div>
        </div>
      </section>

      {/* Plans Section */}
      <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-[#6f1a07] uppercase tracking-wide mb-3">
              Plans
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Built for Every Business Size
            </h2>
            <p className="text-xl text-muted max-w-2xl mx-auto">
              Whether you&apos;re a solo shop owner or running multiple
              branches, OneGemmy scales with you.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.title}
                className={`p-6 rounded-xl border transition-colors ${
                  plan.featured
                    ? "border-[#6f1a07] bg-[#6f1a07]/5 shadow-md"
                    : "border-border hover:border-[#6f1a07]/40"
                }`}
              >
                {plan.featured && (
                  <div className="bg-[#6f1a07] text-white text-xs font-bold px-3 py-1 rounded-md inline-block mb-4">
                    MOST POPULAR
                  </div>
                )}
                <h3 className="text-xl font-bold text-foreground mb-2">
                  {plan.title}
                </h3>
                <p className="text-muted text-sm mb-4">{plan.subtitle}</p>
                <ul className="space-y-3">
                  {plan.features.map((f) => (
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

      {/* Highlights Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#1a1209]">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {highlights.map((item) => (
              <div key={item.label}>
                <div className="text-4xl md:text-5xl font-bold text-white mb-2">
                  {item.value}
                </div>
                <div className="text-white/50 text-sm">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Partners Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-b border-border">
        <div className="max-w-7xl mx-auto">
          <p className="text-center text-sm font-semibold text-muted uppercase tracking-wide mb-8">
            Who we work with
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
            {partners.map((p) => (
              <div key={p.label} className="flex items-center gap-2 text-muted/50 grayscale">
                <p.icon size={20} />
                <span className="font-bold text-lg tracking-tight">{p.label}</span>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-muted/50 mt-8">
            Placeholder marks — real partner logos go here.
          </p>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-surface">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold text-[#6f1a07] uppercase tracking-wide mb-2">
              Security
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">
              Built with security in mind
            </h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-8 max-w-3xl mx-auto">
            {trust.map((t) => (
              <div key={t.title} className="flex flex-col items-center text-center gap-2">
                <t.icon size={24} className="text-[#6f1a07]" />
                <h3 className="font-bold text-foreground text-sm">{t.title}</h3>
                <p className="text-xs text-muted leading-relaxed">{t.description}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-sm mt-10">
            <a href="/security" className="text-[#6f1a07] font-semibold hover:underline">
              See our full security practices →
            </a>
          </p>
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
                <div className="w-10 h-10 rounded-lg bg-[#6f1a07] text-white flex items-center justify-center font-bold text-lg mb-4 mx-auto md:mx-0">
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
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[#1a1209] via-[#2b2118] to-[#3d2f22] overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none [mask-image:radial-gradient(ellipse_at_bottom_right,black,transparent_70%)]" style={DOT_GRID} />
        <div className="relative max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Stop Juggling Tools. Start Today.
          </h2>
          <p className="text-xl text-white/60 mb-10">
            Start free, set up in minutes, and manage everything — sales,
            stock, books, and your team — from one place.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="/register"
              className="bg-[#6f1a07] text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-[#591506] transition-colors inline-flex items-center justify-center gap-2"
            >
              Start Your Free Trial
              <ArrowRight size={20} />
            </a>
            <a
              href="mailto:info@gemmyconnect.com"
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
  icon: typeof Handshake;
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  screenshot: string;
  screenshotAlt: string;
  path: string;
}[] = [
  {
    icon: Store,
    eyebrow: "Point of Sale",
    title: "A checkout screen built for the counter",
    description:
      "Search or scan a product, ring up the sale, and take cash, mobile money, or card — fast enough for a real line at the register, on any browser you already have.",
    points: ["No special terminal hardware needed", "Cash, Mobile Money, and Card", "Hold a sale and come back to it later"],
    screenshot: "/screenshots/pos-terminal.png",
    screenshotAlt: "OneGemmy point of sale screen with products in the cart, totals, and a payment method selector",
    path: "pos",
  },
  {
    icon: Handshake,
    eyebrow: "Sales",
    title: "Close deals faster, never lose track of a lead",
    description:
      "A visual pipeline from first contact to closed deal, with quotes, commissions, and targets built in — so your whole sales team works from one source of truth.",
    points: ["Drag-and-drop pipeline", "Quotes & commissions", "Team targets & performance"],
    screenshot: "/screenshots/sales-pipeline.png",
    screenshotAlt: "OneGemmy CRM pipeline showing leads, qualified deals, and closed-won value by stage",
    path: "crm",
  },
  {
    icon: Package,
    eyebrow: "Inventory",
    title: "Know exactly what's in stock, everywhere",
    description:
      "Track stock across every warehouse in real time, with low-stock alerts and purchase orders that keep you ahead of demand instead of reacting to it.",
    points: ["Multi-warehouse tracking", "Low-stock alerts", "Purchase orders & transfers"],
    screenshot: "/screenshots/inventory.png",
    screenshotAlt: "OneGemmy inventory overview showing stock health, top products by value, and low-stock alerts",
    path: "inventory",
  },
  {
    icon: Calculator,
    eyebrow: "Accounting",
    title: "Your books, always up to date",
    description:
      "Invoicing, expenses, and financial reports stay in sync with every sale and purchase automatically — no manual reconciliation, no surprises at month end.",
    points: ["Automated invoicing", "Expense tracking", "Real-time P&L"],
    screenshot: "/screenshots/accounting.png",
    screenshotAlt: "OneGemmy accounting overview showing income vs expenses and recent activity",
    path: "accounting",
  },
];

const features = [
  {
    icon: BarChart3,
    title: "Real-time dashboard",
    description:
      "Revenue, expenses, pipeline, and stock levels, updated as they happen — not whenever someone gets around to the spreadsheet.",
  },
  {
    icon: Handshake,
    title: "Sales pipeline",
    description:
      "Drag a deal from lead to close. See what's stuck and why, instead of guessing from a notebook.",
  },
  {
    icon: Package,
    title: "Inventory control",
    description:
      "Stock levels across every warehouse, low-stock alerts before you're actually out, and purchase orders in the same screen.",
  },
  {
    icon: FileText,
    title: "Invoicing & payments",
    description:
      "Professional invoices in seconds, payment tracking, and reminders that chase late payers so you don't have to.",
  },
  {
    icon: Users,
    title: "HR & people",
    description:
      "Attendance, leave, and payroll for your team, without a separate HR tool nobody logs into.",
  },
  {
    icon: Languages,
    title: "Built for East Africa",
    description:
      "RWF, KES, UGX, TZS, USD and more, in English, Kinyarwanda, or Swahili — not translated as an afterthought.",
  },
];

const modules = [
  {
    icon: Handshake,
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
    tags: ["Stock Levels", "Warehouses", "Transfers", "Purchase Orders", "Stock Takes"],
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
      "Employee directory, attendance tracking, leave management, payroll, and performance reviews.",
    tags: ["Employees", "Attendance", "Leave", "Payroll", "Performance"],
  },
  {
    icon: Factory,
    title: "Manufacturing",
    description:
      "Plan production with bills of materials, track work orders through the floor, and monitor output.",
    tags: ["Work Orders", "Bill of Materials", "Materials", "Analytics"],
  },
  {
    icon: ClipboardList,
    title: "Procurement",
    description:
      "Purchase orders, supplier accounts, team requisitions, and returns — all in one procurement workflow.",
    tags: ["Purchase Orders", "Suppliers", "Requests", "Returns"],
  },
  {
    icon: Wrench,
    title: "Repairs & Service",
    description:
      "Track repair jobs from intake to delivery, with device details, status, and cost estimates at every step.",
    tags: ["Intake", "Diagnosis", "Parts", "Status Tracking"],
  },
  {
    icon: Handshake,
    title: "CRM",
    description:
      "Build and maintain customer relationships with contact profiles, interaction history, and deal tracking.",
    tags: ["Contacts", "Deals", "Interactions", "Segmentation"],
  },
];

const plans = [
  {
    title: "Free",
    subtitle: "Trial essentials for small businesses",
    featured: false,
    features: ["Basic dashboard", "Up to 2 users", "Core modules", "No credit card required"],
  },
  {
    title: "Starter",
    subtitle: "Growing teams with core modules",
    featured: false,
    features: ["All Free features", "Up to 10 users", "Inventory & sales"],
  },
  {
    title: "Professional",
    subtitle: "Full modules for scaling operations",
    featured: true,
    features: ["All Starter features", "Unlimited users", "HR & accounting"],
  },
  {
    title: "Enterprise",
    subtitle: "Unlimited everything, priority support",
    featured: false,
    features: ["All Professional features", "Custom integrations", "Priority support"],
  },
];

const highlights = [
  { value: "8", label: "Modules in one platform" },
  { value: "6+", label: "Currencies supported" },
  { value: "3", label: "Languages, including Kinyarwanda" },
  { value: "30 min", label: "Average setup time" },
];

const partners = [
  { icon: Hexagon, label: "Partner One" },
  { icon: Triangle, label: "Partner Two" },
  { icon: Circle, label: "Partner Three" },
  { icon: Square, label: "Partner Four" },
  { icon: Pentagon, label: "Partner Five" },
];

const trust = [
  {
    icon: KeyRound,
    title: "Password security",
    description: "Passwords are hashed with bcrypt before they're ever stored — never in plain text.",
  },
  {
    icon: ShieldCheck,
    title: "Tenant data isolation",
    description: "Every business's data is scoped to that business at the data layer, by design.",
  },
  {
    icon: Lock,
    title: "Encrypted in transit",
    description: "OneGemmy is served over HTTPS, so data moving to and from your browser is encrypted.",
  },
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
