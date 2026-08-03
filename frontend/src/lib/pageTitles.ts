import { useEffect } from "react";

export const APP_NAME = "OneGemmy";

const ERP_PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/sales": "Sales Pipeline",
  "/sales/orders": "Orders",
  "/sales/returns": "Sales Returns",
  "/sales/targets": "Sales Targets",
  "/sales/analytics": "Sales Analytics",
  "/products": "Products",
  "/reports": "Reports",
  "/inventory": "Inventory Overview",
  "/inventory/products": "Products",
  "/inventory/categories": "Categories",
  "/inventory/brands": "Brands",
  "/inventory/units": "Units of Measure",
  "/inventory/suppliers": "Suppliers",
  "/inventory/variants": "Variants",
  "/procurement": "Purchases",
  "/procurement/orders": "Purchase Orders",
  "/procurement/requests": "Purchase Requests",
  "/procurement/returns": "Purchase Returns",
  "/procurement/suppliers": "Suppliers",
  "/customers": "Customers",
  "/customers/segments": "Segments",
  "/customers/loyalty": "Loyalty Program",
  "/customers/analytics": "Customer Analytics",
  "/expenses": "Expenses",
  "/finance": "Finance Overview",
  "/finance/accounts": "Accounts",
  "/finance/expenses": "Expenses",
  "/finance/income": "Income",
  "/finance/invoices": "Invoices",
  "/finance/reports": "Finance Reports",
  "/hr": "Employees",
  "/hr/attendance": "Attendance",
  "/hr/leave": "Leave Management",
  "/hr/payroll": "Payroll",
  "/hr/recruiting": "Recruiting",
  "/crm": "CRM Overview",
  "/crm/contacts": "Contacts",
  "/crm/campaigns": "Campaigns",
  "/crm/emails": "Emails",
  "/manufacturing": "Manufacturing",
  "/settings": "General Settings",
  "/settings/users": "Users & Roles",
  "/settings/appearance": "Appearance",
  "/settings/notifications": "Notifications",
  "/settings/security": "Security",
  "/admin": "Platform Overview",
  "/admin/tenants": "Tenants",
};

const DEFAULT_TITLE = "OneGemmy - Business Management Tool | Gemmy Connect Ltd";

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
