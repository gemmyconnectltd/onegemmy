export interface Permission {
  id: string;
  name: string;
  description: string;
  module: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  color: string;
  permissions: string[];
  isSystem?: boolean;
}

// All permissions grouped by module
export const permissions: Permission[] = [
  // Dashboard
  { id: "dashboard.view", name: "View Dashboard", description: "Can view the main dashboard", module: "Dashboard" },

  // Sales
  { id: "sales.view", name: "View Sales", description: "Can view sales pipeline and deals", module: "Sales" },
  { id: "sales.create", name: "Create Deals", description: "Can create new deals", module: "Sales" },
  { id: "sales.edit", name: "Edit Deals", description: "Can edit existing deals", module: "Sales" },
  { id: "sales.delete", name: "Delete Deals", description: "Can delete deals", module: "Sales" },
  { id: "sales.leads.manage", name: "Manage Leads", description: "Can create, edit, delete leads", module: "Sales" },
  { id: "sales.quotes.manage", name: "Manage Quotes", description: "Can create and send quotes", module: "Sales" },
  { id: "sales.targets.view", name: "View Targets", description: "Can view sales targets", module: "Sales" },
  { id: "sales.targets.set", name: "Set Targets", description: "Can set sales targets for team", module: "Sales" },
  { id: "sales.commissions.view", name: "View Commissions", description: "Can view commission reports", module: "Sales" },

  // Stock / Inventory
  { id: "stock.view", name: "View Stock", description: "Can view inventory levels", module: "Stock" },
  { id: "stock.create", name: "Add Products", description: "Can add new products", module: "Stock" },
  { id: "stock.edit", name: "Edit Products", description: "Can edit product details", module: "Stock" },
  { id: "stock.delete", name: "Delete Products", description: "Can delete products", module: "Stock" },
  { id: "stock.adjust", name: "Adjust Stock", description: "Can make stock adjustments", module: "Stock" },
  { id: "stock.transfer", name: "Transfer Stock", description: "Can transfer stock between warehouses", module: "Stock" },
  { id: "stock.purchase orders", name: "Manage Purchase Orders", description: "Can create and manage POs", module: "Stock" },
  { id: "stock.stocktake", name: "Manage Stock Takes", description: "Can perform physical stock takes", module: "Stock" },

  // Finance
  { id: "finance.view", name: "View Finance", description: "Can view financial data", module: "Finance" },
  { id: "finance.invoices.manage", name: "Manage Invoices", description: "Can create and send invoices", module: "Finance" },
  { id: "finance.expenses.manage", name: "Manage Expenses", description: "Can record and approve expenses", module: "Finance" },
  { id: "finance.reports.view", name: "View Financial Reports", description: "Can view P&L, balance sheet", module: "Finance" },
  { id: "finance.budgets.manage", name: "Manage Budgets", description: "Can set and edit budgets", module: "Finance" },
  { id: "finance.payments.process", name: "Process Payments", description: "Can record incoming/outgoing payments", module: "Finance" },

  // HR
  { id: "hr.view", name: "View HR", description: "Can view employee directory", module: "HR" },
  { id: "hr.employees.manage", name: "Manage Employees", description: "Can add, edit, remove employees", module: "HR" },
  { id: "hr.attendance.manage", name: "Manage Attendance", description: "Can track and manage attendance", module: "HR" },
  { id: "hr.leave.manage", name: "Manage Leave", description: "Can approve/reject leave requests", module: "HR" },
  { id: "hr.payroll.view", name: "View Payroll", description: "Can view payroll data", module: "HR" },
  { id: "hr.payroll.manage", name: "Manage Payroll", description: "Can process payroll", module: "HR" },
  { id: "hr.performance.manage", name: "Manage Reviews", description: "Can conduct performance reviews", module: "HR" },

  // Projects
  { id: "projects.view", name: "View Projects", description: "Can view projects", module: "Projects" },
  { id: "projects.create", name: "Create Projects", description: "Can create new projects", module: "Projects" },
  { id: "projects.edit", name: "Edit Projects", description: "Can edit project details", module: "Projects" },
  { id: "projects.delete", name: "Delete Projects", description: "Can delete projects", module: "Projects" },
  { id: "projects.tasks.manage", name: "Manage Tasks", description: "Can create and assign tasks", module: "Projects" },
  { id: "projects.time.view", name: "View Time Tracking", description: "Can view time tracking data", module: "Projects" },

  // CRM
  { id: "crm.view", name: "View CRM", description: "Can view contacts", module: "CRM" },
  { id: "crm.contacts.manage", name: "Manage Contacts", description: "Can add, edit, delete contacts", module: "CRM" },
  { id: "crm.interactions.log", name: "Log Interactions", description: "Can log customer interactions", module: "CRM" },

  // Reports
  { id: "reports.view", name: "View Reports", description: "Can view reports", module: "Reports" },
  { id: "reports.export", name: "Export Reports", description: "Can export reports to PDF/CSV", module: "Reports" },
  { id: "reports.custom", name: "Custom Reports", description: "Can create custom reports", module: "Reports" },

  // Settings
  { id: "settings.view", name: "View Settings", description: "Can view settings", module: "Settings" },
  { id: "settings.company", name: "Company Settings", description: "Can edit company info", module: "Settings" },
  { id: "settings.users.manage", name: "Manage Users", description: "Can add, edit, remove users", module: "Settings" },
  { id: "settings.roles.manage", name: "Manage Roles", description: "Can create and edit roles", module: "Settings" },
  { id: "settings.integrations", name: "Manage Integrations", description: "Can connect third-party apps", module: "Settings" },
];

// Default roles
export const defaultRoles: Role[] = [
  {
    id: "owner",
    name: "Owner",
    description: "Full access to everything. Cannot be edited or deleted.",
    color: "#af9164",
    permissions: permissions.map((p) => p.id),
    isSystem: true,
  },
  {
    id: "admin",
    name: "Admin",
    description: "Full access except company settings and user management.",
    color: "#6f1a07",
    permissions: permissions
      .filter((p) => !["settings.company", "settings.users.manage", "settings.roles.manage"].includes(p.id))
      .map((p) => p.id),
    isSystem: true,
  },
  {
    id: "manager",
    name: "Manager",
    description: "Can manage team, view reports, approve requests.",
    color: "#6f5a3a",
    permissions: [
      "dashboard.view",
      "sales.view", "sales.create", "sales.edit", "sales.leads.manage", "sales.targets.view", "sales.commissions.view",
      "stock.view", "stock.create", "stock.edit", "stock.adjust",
      "finance.view", "finance.invoices.manage", "finance.reports.view",
      "hr.view", "hr.employees.manage", "hr.attendance.manage", "hr.leave.manage",
      "projects.view", "projects.create", "projects.edit", "projects.tasks.manage",
      "crm.view", "crm.contacts.manage", "crm.interactions.log",
      "reports.view", "reports.export",
    ],
  },
  {
    id: "sales_rep",
    name: "Sales Representative",
    description: "Can manage leads, deals, quotes, and contacts.",
    color: "#10B981",
    permissions: [
      "dashboard.view",
      "sales.view", "sales.create", "sales.edit", "sales.leads.manage", "sales.quotes.manage",
      "crm.view", "crm.contacts.manage", "crm.interactions.log",
      "reports.view",
    ],
  },
  {
    id: "inventory_mgr",
    name: "Inventory Manager",
    description: "Can manage products, stock, and purchase orders.",
    color: "#F59E0B",
    permissions: [
      "dashboard.view",
      "stock.view", "stock.create", "stock.edit", "stock.adjust", "stock.transfer", "stock.purchase orders", "stock.stocktake",
      "reports.view",
    ],
  },
  {
    id: "accountant",
    name: "Accountant",
    description: "Can manage invoices, expenses, and view financial reports.",
    color: "#3B82F6",
    permissions: [
      "dashboard.view",
      "finance.view", "finance.invoices.manage", "finance.expenses.manage", "finance.reports.view", "finance.budgets.manage", "finance.payments.process",
      "reports.view", "reports.export",
    ],
  },
  {
    id: "employee",
    name: "Employee",
    description: "Basic access to dashboard and assigned tasks.",
    color: "#64748B",
    permissions: [
      "dashboard.view",
      "projects.view",
      "crm.view",
    ],
  },
];

export const modules = ["Dashboard", "Sales", "Stock", "Finance", "HR", "Projects", "CRM", "Reports", "Settings"];

export function getPermissionsByModule(module: string): Permission[] {
  return permissions.filter((p) => p.module === module);
}

export function getRoleById(roles: Role[], id: string): Role | undefined {
  return roles.find((r) => r.id === id);
}
