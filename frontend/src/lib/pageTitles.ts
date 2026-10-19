import { useEffect } from "react";
import { siteConfig } from "./config";

/** Re-exported so existing imports keep working — the actual name lives in siteConfig.name. */
export const APP_NAME = siteConfig.name;

const ERP_PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/sales": "Sales Pipeline",
  "/sales/orders": "Sales History",
  "/sales/returns": "Sales Returns",
  "/sales/targets": "Sales Targets",
  "/sales/analytics": "Sales Analytics",
  "/services": "Services",
  "/products": "Products",
  "/reports": "Reports",
  "/support": "Help & Support",
  "/inventory": "Inventory Overview",
  "/inventory/products": "Products",
  "/inventory/categories": "Categories",
  "/inventory/brands": "Brands",
  "/inventory/units": "Units of Measure",
  "/inventory/suppliers": "Suppliers",
  "/inventory/variants": "Variants",
  "/procurement": "Purchases",
  "/procurement/orders": "Purchase History",
  "/procurement/requests": "Purchase Requests",
  "/procurement/returns": "Purchase Returns",
  "/procurement/suppliers": "Suppliers",
  "/customers": "Customers",
  "/customers/segments": "Segments",
  "/customers/loyalty": "Loyalty Program",
  "/customers/analytics": "Customer Analytics",
  "/expenses": "Expense Management",
  "/expenses/list": "Expenses",
  "/expenses/categories": "Expense Categories",
  "/expenses/new": "Create Expense",
  "/debts": "Debt Overview",
  "/debts/receivables": "Receivables",
  "/debts/payables": "Payables",
  "/accounting": "Accounting Overview",
  "/accounting/accounts": "Chart of Accounts",
  "/accounting/ledger": "General Ledger",
  "/accounting/receivables": "Accounts Receivable",
  "/accounting/payables": "Accounts Payable",
  "/accounting/cash-bank": "Cash & Bank",
  "/accounting/assets": "Fixed Assets",
  "/accounting/payroll": "Payroll",
  "/accounting/tax": "Tax Management",
  "/accounting/expenses": "Expenses",
  "/accounting/income": "Income",
  "/accounting/invoices": "Invoices",
  "/accounting/reports": "Accounting Reports",
  "/hr": "Employees",
  "/hr/departments": "Departments",
  "/hr/attendance": "Attendance",
  "/hr/leave": "Leave Management",
  "/hr/payroll": "Payroll",
  "/hr/recruiting": "Recruiting",
  "/crm": "CRM Overview",
  "/crm/contacts": "Contacts",
  "/crm/campaigns": "Campaigns",
  "/crm/emails": "Emails",
  "/manufacturing": "Manufacturing",
  "/branches": "Branch Management",
  "/settings": "Business Settings",
  "/settings/billing": "Plans & Billing",
  "/settings/financial": "Financial Settings",
  "/profile": "My Profile",
  "/settings/profile": "My Profile",
  "/settings/users": "Users & Roles",
  "/settings/branches": "Branches",
  "/settings/appearance": "Appearance",
  "/settings/notifications": "Notifications",
  "/settings/security": "Security",
};

const DEFAULT_TITLE = `${APP_NAME} - Business Management Tool`;

export function pageTitleForPath(pathname: string): string {
  const title = ERP_PAGE_TITLES[pathname];
  if (!title) return DEFAULT_TITLE;
  return `${title} - ${APP_NAME}`;
}

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} - ${APP_NAME}`;
  }, [title]);
}
