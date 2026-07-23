export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#0070C0] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">O</span>
              </div>
              <span className="text-xl font-bold text-[#002B5C]">
                OneGemmy
              </span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a
                href="#features"
                className="text-gray-600 hover:text-[#0070C0] transition-colors"
              >
                Features
              </a>
              <a
                href="#modules"
                className="text-gray-600 hover:text-[#0070C0] transition-colors"
              >
                Modules
              </a>
              <a
                href="#pricing"
                className="text-gray-600 hover:text-[#0070C0] transition-colors"
              >
                Pricing
              </a>
              <a
                href="#about"
                className="text-gray-600 hover:text-[#0070C0] transition-colors"
              >
                About
              </a>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="/login"
                className="text-gray-600 hover:text-[#0070C0] transition-colors font-medium"
              >
                Sign In
              </a>
              <a
                href="/register"
                className="bg-[#0070C0] text-white px-5 py-2 rounded-lg font-medium hover:bg-[#005A9E] transition-colors"
              >
                Get Started
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[#002B5C] via-[#0070C0] to-[#00B4D8]">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-block bg-white/10 backdrop-blur-sm text-white px-4 py-2 rounded-full text-sm font-medium mb-6">
            All-in-One Business Management Platform
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
            Run Your Business
            <br />
            <span className="text-[#00B4D8]">From One Place</span>
          </h1>
          <p className="text-xl text-white/80 max-w-3xl mx-auto mb-10">
            OneGemmy brings sales, inventory, finance, HR, projects, and CRM
            together in a single powerful platform. Stop juggling multiple tools
            — manage everything with OneGemmy.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/register"
              className="bg-white text-[#002B5C] px-8 py-4 rounded-lg font-bold text-lg hover:bg-gray-100 transition-colors"
            >
              Start Free Trial
            </a>
            <a
              href="#demo"
              className="border-2 border-white text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-white/10 transition-colors"
            >
              Watch Demo
            </a>
          </div>
          <div className="mt-16 flex flex-wrap justify-center gap-8 text-white/70 text-sm">
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              No credit card required
            </div>
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              Free for small teams
            </div>
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              Setup in 30 minutes
            </div>
          </div>
        </div>
      </section>

      {/* Trusted By */}
      <section className="py-12 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-gray-400 text-sm mb-8">
            Trusted by businesses of all sizes
          </p>
          <div className="flex flex-wrap justify-center items-center gap-12 opacity-40">
            {["Company A", "Company B", "Company C", "Company D", "Company E"].map(
              (name) => (
                <div
                  key={name}
                  className="text-2xl font-bold text-gray-300"
                >
                  {name}
                </div>
              )
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-[#002B5C] mb-4">
              Everything You Need to Run Your Business
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              One powerful platform replaces multiple tools. Save time, reduce
              errors, and get a complete view of your business.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="p-6 rounded-xl border border-gray-100 hover:border-[#0070C0]/30 hover:shadow-lg transition-all"
              >
                <div className="w-12 h-12 bg-[#0070C0]/10 rounded-lg flex items-center justify-center mb-4">
                  <span className="text-2xl">{feature.icon}</span>
                </div>
                <h3 className="text-xl font-bold text-[#002B5C] mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Modules Section */}
      <section id="modules" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-[#002B5C] mb-4">
              Powerful Modules for Every Department
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Each module is designed to handle a specific area of your business
              with depth and simplicity.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {modules.map((module) => (
              <div
                key={module.title}
                className="bg-white rounded-xl p-8 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-[#0070C0] to-[#00B4D8] rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl text-white">{module.icon}</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-[#002B5C] mb-2">
                      {module.title}
                    </h3>
                    <p className="text-gray-600 mb-4">{module.description}</p>
                    <div className="flex flex-wrap gap-2">
                      {module.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs bg-[#0070C0]/10 text-[#0070C0] px-3 py-1 rounded-full"
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
            <h2 className="text-3xl md:text-4xl font-bold text-[#002B5C] mb-4">
              Built for Every Business Size
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Whether you&apos;re a solo entrepreneur or a large enterprise,
              OneGemmy scales with you.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {businessSizes.map((size) => (
              <div
                key={size.title}
                className={`rounded-xl p-8 border-2 transition-all ${
                  size.featured
                    ? "border-[#0070C0] bg-[#0070C0]/5 shadow-lg scale-105"
                    : "border-gray-200 hover:border-[#0070C0]/30"
                }`}
              >
                {size.featured && (
                  <div className="bg-[#0070C0] text-white text-xs font-bold px-3 py-1 rounded-full inline-block mb-4">
                    MOST POPULAR
                  </div>
                )}
                <h3 className="text-2xl font-bold text-[#002B5C] mb-2">
                  {size.title}
                </h3>
                <p className="text-gray-500 mb-4">{size.subtitle}</p>
                <ul className="space-y-3">
                  {size.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-gray-700">
                      <svg
                        className="w-5 h-5 text-[#2ECC71] flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
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
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#002B5C]">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {stats.map((stat) => (
              <div key={stat.label}>
                <div className="text-4xl md:text-5xl font-bold text-white mb-2">
                  {stat.value}
                </div>
                <div className="text-white/70">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-[#002B5C] mb-6">
            Ready to Transform Your Business?
          </h2>
          <p className="text-xl text-gray-600 mb-10">
            Join thousands of businesses already using OneGemmy to manage their
            operations, boost sales, and grow faster.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/register"
              className="bg-[#0070C0] text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-[#005A9E] transition-colors"
            >
              Start Your Free Trial
            </a>
            <a
              href="/contact"
              className="border-2 border-[#0070C0] text-[#0070C0] px-8 py-4 rounded-lg font-bold text-lg hover:bg-[#0070C0]/5 transition-colors"
            >
              Contact Sales
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#002B5C] text-white py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-[#0070C0] rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">O</span>
                </div>
                <span className="text-xl font-bold">OneGemmy</span>
              </div>
              <p className="text-white/70">
                All-in-one business management platform by Gemmy Connect Ltd.
              </p>
            </div>
            <div>
              <h4 className="font-bold mb-4">Product</h4>
              <ul className="space-y-2 text-white/70">
                <li>
                  <a href="#features" className="hover:text-white transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#modules" className="hover:text-white transition-colors">
                    Modules
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="hover:text-white transition-colors">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="/docs" className="hover:text-white transition-colors">
                    Documentation
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Company</h4>
              <ul className="space-y-2 text-white/70">
                <li>
                  <a href="#about" className="hover:text-white transition-colors">
                    About Us
                  </a>
                </li>
                <li>
                  <a href="/contact" className="hover:text-white transition-colors">
                    Contact
                  </a>
                </li>
                <li>
                  <a href="/careers" className="hover:text-white transition-colors">
                    Careers
                  </a>
                </li>
                <li>
                  <a href="/blog" className="hover:text-white transition-colors">
                    Blog
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Legal</h4>
              <ul className="space-y-2 text-white/70">
                <li>
                  <a href="/privacy" className="hover:text-white transition-colors">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="/terms" className="hover:text-white transition-colors">
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a href="/security" className="hover:text-white transition-colors">
                    Security
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/20 pt-8 text-center text-white/50 text-sm">
            <p>
              &copy; {new Date().getFullYear()} Gemmy Connect Ltd. All rights
              reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

const features = [
  {
    icon: "📊",
    title: "Real-time Dashboard",
    description:
      "See your entire business at a glance. Revenue, expenses, sales pipeline, stock levels — all updated in real-time.",
  },
  {
    icon: "🤝",
    title: "Sales Pipeline",
    description:
      "Visual drag-and-drop pipeline to track every deal from lead to close. Never lose track of an opportunity.",
  },
  {
    icon: "📦",
    title: "Inventory Control",
    description:
      "Track stock across multiple warehouses with barcode scanning, low-stock alerts, and purchase orders.",
  },
  {
    icon: "💰",
    title: "Invoicing & Payments",
    description:
      "Create professional invoices, track payments, and manage expenses. Get paid faster with automated reminders.",
  },
  {
    icon: "👥",
    title: "HR & People Management",
    description:
      "Manage employees, attendance, leave, and performance reviews. Keep your team organized and productive.",
  },
  {
    icon: "📈",
    title: "Powerful Analytics",
    description:
      "Generate custom reports, track KPIs, and get insights that help you make smarter business decisions.",
  },
];

const modules = [
  {
    icon: "💼",
    title: "Sales Management",
    description:
      "Complete sales lifecycle from leads to orders. Pipeline, quotes, commissions, targets, and analytics.",
    tags: [
      "Pipeline",
      "Leads",
      "Quotes",
      "Orders",
      "Commissions",
      "Targets",
    ],
  },
  {
    icon: "📦",
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
    icon: "💰",
    title: "Finance & Accounting",
    description:
      "Invoicing, expenses, revenue tracking, financial reports, tax calculations, and budget management.",
    tags: ["Invoices", "Expenses", "P&L", "Budgets", "Tax"],
  },
  {
    icon: "👥",
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
    icon: "📋",
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
    icon: "🎯",
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
