export interface MarketingDetail { headline: string; intro: string; steps: [string, string][]; related: string[]; note: string; }
export const marketingDetails: Record<string, MarketingDetail> = {
  "product-pos": {
    "headline": "Make every checkout feel simple.",
    "intro": "Keep the counter moving with a cart, payment selection and receipt in one flow.",
    "steps": [
      [
        "Build the cart",
        "Find products and adjust quantities before charging."
      ],
      [
        "Record the payment",
        "Choose the supported payment method and record the amount received."
      ],
      [
        "Keep the sale connected",
        "Review the transaction in sales history alongside its customer and stock records."
      ]
    ],
    "related": [
      "product-inventory",
      "product-customers",
      "product-reports"
    ],
    "note": "Available workflows depend on your company’s enabled modules and your permissions."
  },
  "product-inventory": {
    "headline": "Know what you have. Plan what comes next.",
    "intro": "Bring products, variants and stock movements into a clearer daily workflow.",
    "steps": [
      [
        "Organize your catalog",
        "Keep product details and variants together."
      ],
      [
        "Follow stock movements",
        "Review receipts, sales and adjustments with their references."
      ],
      [
        "Review stock value",
        "Use stock reports to understand quantities and inventory value."
      ]
    ],
    "related": [
      "product-purchases",
      "product-manufacturing",
      "product-reports"
    ],
    "note": "Available workflows depend on your company’s enabled modules and your permissions."
  },
  "product-purchases": {
    "headline": "From supplier to shelf, stay in control.",
    "intro": "Keep purchasing decisions, supplier records and received goods connected.",
    "steps": [
      [
        "Prepare the purchase",
        "Select a supplier, items, quantities and unit costs."
      ],
      [
        "Review before receiving",
        "Check the purchase details and expected delivery."
      ],
      [
        "Follow the balance",
        "Review purchase history and unpaid supplier amounts."
      ]
    ],
    "related": [
      "product-inventory",
      "product-debts",
      "product-expenses"
    ],
    "note": "Available workflows depend on your company’s enabled modules and your permissions."
  },
  "product-expenses": {
    "headline": "See where your business money goes.",
    "intro": "Record day-to-day spending with the context your team needs to review it.",
    "steps": [
      [
        "Record the essentials",
        "Capture the date, category, amount and payment method."
      ],
      [
        "Keep the evidence",
        "Attach a receipt and include a reference or notes."
      ],
      [
        "Review your spending",
        "Filter expense records and review category totals for a selected period."
      ]
    ],
    "related": [
      "product-accounting",
      "product-reports",
      "product-purchases"
    ],
    "note": "Available workflows depend on your company’s enabled modules and your permissions."
  },
  "product-debts": {
    "headline": "Give every unpaid balance a clear next step.",
    "intro": "Keep customer receivables and supplier payables visible without mixing their workflows.",
    "steps": [
      [
        "Review what is outstanding",
        "See original amounts, payments and remaining balances."
      ],
      [
        "Follow due dates",
        "Identify overdue items and upcoming collections."
      ],
      [
        "Record repayments",
        "Keep payment history connected to the underlying sale or purchase."
      ]
    ],
    "related": [
      "product-customers",
      "product-purchases",
      "product-reports"
    ],
    "note": "Available workflows depend on your company’s enabled modules and your permissions."
  },
  "product-customers": {
    "headline": "Remember the customer behind every sale.",
    "intro": "Keep customer details and transaction history accessible to the people who need them.",
    "steps": [
      [
        "Build a useful directory",
        "Keep contact details in a shared customer record."
      ],
      [
        "Review sales history",
        "Find the transactions connected to a customer."
      ],
      [
        "Understand outstanding credit",
        "Review unpaid balances before extending further credit."
      ]
    ],
    "related": [
      "product-pos",
      "product-debts",
      "product-reports"
    ],
    "note": "Available workflows depend on your company’s enabled modules and your permissions."
  },
  "product-accounting": {
    "headline": "Bring daily activity into financial focus.",
    "intro": "Review financial records and reports alongside the operations that create them.",
    "steps": [
      [
        "Keep records organized",
        "Work with accounts, journals and transaction references."
      ],
      [
        "Review financial activity",
        "Follow income and expenses from the accounting workspace."
      ],
      [
        "Use the reports",
        "Review financial statements for the reporting period you need."
      ]
    ],
    "related": [
      "product-expenses",
      "product-reports",
      "product-debts"
    ],
    "note": "Available workflows depend on your company’s enabled modules and your permissions."
  },
  "product-reports": {
    "headline": "A clearer view of every business day.",
    "intro": "Use reports to review activity by period and, where supported, by authorized branch.",
    "steps": [
      [
        "Choose the scope",
        "Set the date range and the branch you are authorized to review."
      ],
      [
        "Review the day",
        "Bring sales, collections and operating expenses into focus."
      ],
      [
        "Share the report",
        "Use available report exports for review outside the workspace."
      ]
    ],
    "related": [
      "product-branches",
      "product-accounting",
      "product-inventory"
    ],
    "note": "Available workflows depend on your company’s enabled modules and your permissions."
  },
  "product-services": {
    "headline": "Keep service work moving.",
    "intro": "Connect your service catalog, bookings and delivery in a shared workspace.",
    "steps": [
      [
        "Define your services",
        "Maintain the services your team provides."
      ],
      [
        "Organize the work",
        "Review appointments and walk-in activity."
      ],
      [
        "Follow delivery",
        "Keep service records accessible as work progresses."
      ]
    ],
    "related": [
      "product-customers",
      "product-hr",
      "product-expenses"
    ],
    "note": "Available workflows depend on your company’s enabled modules and your permissions."
  },
  "product-manufacturing": {
    "headline": "Connect materials to finished goods.",
    "intro": "For businesses with manufacturing enabled, organize production alongside inventory.",
    "steps": [
      [
        "Prepare production",
        "Define materials and work orders for the job."
      ],
      [
        "Record output",
        "Track production, material consumption and wastage."
      ],
      [
        "Review stock effects",
        "Follow the movements associated with production records."
      ]
    ],
    "related": [
      "product-inventory",
      "product-purchases",
      "product-reports"
    ],
    "note": "Available workflows depend on your company’s enabled modules and your permissions."
  },
  "product-hr": {
    "headline": "Bring your people operations together.",
    "intro": "Keep staff records, attendance and payroll workflows in the same business workspace.",
    "steps": [
      [
        "Organize staff records",
        "Keep employee information available to authorized users."
      ],
      [
        "Review attendance",
        "Follow attendance and leave records."
      ],
      [
        "Prepare payroll",
        "Use the available payroll workflow with appropriate access controls."
      ]
    ],
    "related": [
      "product-branches",
      "product-expenses",
      "product-reports"
    ],
    "note": "Available workflows depend on your company’s enabled modules and your permissions."
  },
  "product-branches": {
    "headline": "One business. A clearer view of each location.",
    "intro": "Organize locations and user access as your business grows beyond a single branch.",
    "steps": [
      [
        "Set up locations",
        "Maintain the branches your company operates."
      ],
      [
        "Assign access",
        "Give users access to the branches their responsibilities require."
      ],
      [
        "Review branch activity",
        "Use supported branch filters to compare operational activity."
      ]
    ],
    "related": [
      "product-reports",
      "product-hr",
      "product-inventory"
    ],
    "note": "Available workflows depend on your company’s enabled modules and your permissions."
  },
  "industry-retail": {
    "headline": "Run the shop with less back-and-forth.",
    "intro": "Keep checkout, stock and customer balances connected through the trading day.",
    "steps": [
      [
        "Open with a stock check",
        "Review available products and items that need attention."
      ],
      [
        "Trade from one workspace",
        "Record sales and connect them to customer records."
      ],
      [
        "Close with a clearer view",
        "Review the day’s sales and operating expenses."
      ]
    ],
    "related": [
      "product-pos",
      "product-inventory",
      "product-debts"
    ],
    "note": "Choose the modules that fit your operations. Access and available workflows depend on company setup and permissions."
  },
  "industry-restaurants": {
    "headline": "Bring clarity to the business behind every meal.",
    "intro": "Organize sales, ingredient purchases and day-to-day spending with a shared business record.",
    "steps": [
      [
        "Prepare for the day",
        "Review products and supplier purchases."
      ],
      [
        "Record sales as you serve",
        "Keep payment and sales records together."
      ],
      [
        "Review operating costs",
        "Track purchasing and expenses alongside daily activity."
      ]
    ],
    "related": [
      "product-pos",
      "product-purchases",
      "product-expenses"
    ],
    "note": "Choose the modules that fit your operations. Access and available workflows depend on company setup and permissions."
  },
  "industry-pharmacies": {
    "headline": "Keep product records close to daily sales.",
    "intro": "Organize the business side of a pharmacy with inventory, purchasing and sales records.",
    "steps": [
      [
        "Organize stock",
        "Maintain products and supported batch and expiry information."
      ],
      [
        "Plan replenishment",
        "Review supplier purchasing and stock availability."
      ],
      [
        "Review sales",
        "Follow daily sales and customer payment records."
      ]
    ],
    "related": [
      "product-inventory",
      "product-purchases",
      "product-pos"
    ],
    "note": "Pesaa supports business operations. It does not replace specialized clinical, hotel reservation or industry compliance systems."
  },
  "industry-wholesale": {
    "headline": "Keep volume, suppliers and customer credit connected.",
    "intro": "Bring bulk purchasing, stock visibility and outstanding balances into one workflow.",
    "steps": [
      [
        "Plan purchasing",
        "Review suppliers, quantities and unit costs."
      ],
      [
        "Track goods",
        "Follow available stock and recorded movements."
      ],
      [
        "Follow collections",
        "Review customer balances and payment history."
      ]
    ],
    "related": [
      "product-purchases",
      "product-inventory",
      "product-debts"
    ],
    "note": "Choose the modules that fit your operations. Access and available workflows depend on company setup and permissions."
  },
  "industry-service-businesses": {
    "headline": "More organized service. Less administrative chasing.",
    "intro": "Keep your service catalog, customer records and business expenses together.",
    "steps": [
      [
        "Define the offering",
        "Maintain the services your team delivers."
      ],
      [
        "Coordinate customer work",
        "Review bookings and service records."
      ],
      [
        "Review the business",
        "Keep expenses and customer information accessible."
      ]
    ],
    "related": [
      "product-services",
      "product-customers",
      "product-expenses"
    ],
    "note": "Choose the modules that fit your operations. Access and available workflows depend on company setup and permissions."
  },
  "industry-hardware": {
    "headline": "Keep a wide catalog under control.",
    "intro": "Organize product stock, purchasing costs and sales for hardware and building supplies.",
    "steps": [
      [
        "Maintain the catalog",
        "Keep product details and variants organized."
      ],
      [
        "Restock with context",
        "Review supplier purchase records and unit costs."
      ],
      [
        "Follow sales",
        "Record transactions and review the stock they affect."
      ]
    ],
    "related": [
      "product-inventory",
      "product-purchases",
      "product-pos"
    ],
    "note": "Choose the modules that fit your operations. Access and available workflows depend on company setup and permissions."
  },
  "industry-supermarkets": {
    "headline": "Keep the trading floor and back office connected.",
    "intro": "Bring everyday checkout, replenishment and spending into one business workspace.",
    "steps": [
      [
        "Prepare the shelves",
        "Review product availability."
      ],
      [
        "Keep checkout moving",
        "Build carts and record customer payments."
      ],
      [
        "Review the day",
        "Follow sales and operating expenses."
      ]
    ],
    "related": [
      "product-pos",
      "product-inventory",
      "product-expenses"
    ],
    "note": "Choose the modules that fit your operations. Access and available workflows depend on company setup and permissions."
  },
  "industry-automotive": {
    "headline": "Give parts stock a clearer business record.",
    "intro": "Manage the purchasing and selling of parts with connected product and supplier records.",
    "steps": [
      [
        "Organize parts",
        "Maintain product details and variants."
      ],
      [
        "Follow supplier activity",
        "Review purchasing and stock receipts."
      ],
      [
        "Keep customer context",
        "Connect customer records to their sales history."
      ]
    ],
    "related": [
      "product-inventory",
      "product-purchases",
      "product-customers"
    ],
    "note": "Choose the modules that fit your operations. Access and available workflows depend on company setup and permissions."
  },
  "industry-electronics": {
    "headline": "Stay close to your products and margins.",
    "intro": "Organize electronics stock, purchase costs and customer sales in one workspace.",
    "steps": [
      [
        "Maintain product detail",
        "Use supported variants and serial information."
      ],
      [
        "Review purchasing",
        "Check supplier unit costs before receiving goods."
      ],
      [
        "Follow the customer",
        "Review customer records and transaction history."
      ]
    ],
    "related": [
      "product-inventory",
      "product-purchases",
      "product-customers"
    ],
    "note": "Choose the modules that fit your operations. Access and available workflows depend on company setup and permissions."
  },
  "industry-manufacturing": {
    "headline": "From raw materials to a clearer production day.",
    "intro": "Use manufacturing alongside inventory when the module is enabled for your company.",
    "steps": [
      [
        "Prepare work orders",
        "Plan the materials and production work."
      ],
      [
        "Record production",
        "Follow material consumption, output and wastage."
      ],
      [
        "Review activity",
        "Use stock records and available reports to check the result."
      ]
    ],
    "related": [
      "product-manufacturing",
      "product-inventory",
      "product-reports"
    ],
    "note": "Choose the modules that fit your operations. Access and available workflows depend on company setup and permissions."
  },
  "industry-hospitality": {
    "headline": "A clearer business view behind the guest experience.",
    "intro": "Organize business sales, staff and expenses alongside your existing hospitality operations.",
    "steps": [
      [
        "Keep spending visible",
        "Record day-to-day operating costs."
      ],
      [
        "Organize your team",
        "Maintain staff and attendance records."
      ],
      [
        "Review the books",
        "Follow financial records and reports."
      ]
    ],
    "related": [
      "product-expenses",
      "product-hr",
      "product-accounting"
    ],
    "note": "Pesaa supports business operations. It does not replace specialized clinical, hotel reservation or industry compliance systems."
  },
  "industry-other": {
    "headline": "Build a workspace around how you operate.",
    "intro": "Choose the relevant Pesaa modules for your products, services, people and locations.",
    "steps": [
      [
        "Start with your workflow",
        "Identify the operations your team needs to manage."
      ],
      [
        "Choose relevant modules",
        "Discuss the features that fit your business."
      ],
      [
        "Grow deliberately",
        "Add locations and access as responsibilities expand."
      ]
    ],
    "related": [
      "product-inventory",
      "product-services",
      "product-branches"
    ],
    "note": "Choose the modules that fit your operations. Access and available workflows depend on company setup and permissions."
  },
  "industry-agriculture": {
    "headline": "Keep seasonal stock and supplier activity connected.",
    "intro": "Organize the business side of an agriculture input store, from purchasing and stock records to customer sales.",
    "steps": [
      [
        "Prepare for seasonal demand",
        "Review product availability and supplier purchases."
      ],
      [
        "Keep stock organized",
        "Maintain product details, categories and supported batch information."
      ],
      [
        "Review daily activity",
        "Follow sales, customer balances and operating expenses."
      ]
    ],
    "related": [
      "product-inventory",
      "product-purchases",
      "product-reports"
    ],
    "note": "Choose modules and permissions for your operations. Pesaa business records do not replace specialist agricultural advice or regulatory compliance systems."
  }
};
