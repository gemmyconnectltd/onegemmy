```dbml
// OneGemmy ERD — Multi-tenant SaaS Platform
// Docs: https://dbml.dbdiagram.io/docs
// Updated: + finance tax tables, + full HR module, order_items.variant_id,
//          fixed users/inventory indexes to match models.
//          + procurement module (purchase_orders, purchase_items),
//          finance_transactions.purchase_id.

// ============================================================
// CORE TENANT TABLES
// ============================================================

Table tenants {
  id uuid [primary key]
  name varchar(255) [not null]
  slug varchar(100) [unique, not null, note: "URL-safe identifier"]
  is_active boolean [default: true]
  logo_url varchar(500)
  website varchar(255)
  phone varchar(50)
  address varchar(500)
  city varchar(100)
  country varchar(100)
  subscription_plan varchar(50) [default: "free", note: "free | starter | pro | enterprise"]
  subscription_status varchar(50) [default: "active", note: "active | suspended | cancelled"]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]
}

Table branches {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  name varchar(255) [not null]
  location varchar(255)
  status varchar(20) [default: "active", note: "active | inactive"]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]
}

Table departments {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  name varchar(100) [not null]
  description varchar(255)
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    (tenant_id, name) [unique]
  }
}

Table roles {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  name varchar(50) [not null]
  description varchar(255)
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    (tenant_id, name) [unique]
  }
}

Table permissions {
  id uuid [primary key]
  name varchar(100) [unique, not null]
  description varchar(255)
  resource varchar(50) [not null, note: "e.g. inventory, sales, finance"]
  action varchar(50) [not null, note: "e.g. read, create, update, delete"]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]
}

Table role_permissions {
  role_id uuid [not null, ref: > roles.id]
  permission_id uuid [not null, ref: > permissions.id]

  indexes {
    (role_id, permission_id) [unique]
  }
}

Table users {
  id uuid [primary key]
  tenant_id uuid [ref: > tenants.id, note: "null = superuser/platform admin"]
  email varchar(255) [unique, not null, note: "unique across all tenants"]
  hashed_password varchar(255) [not null]
  full_name varchar(255) [not null]
  role varchar(50) [default: "member", note: "legacy string role"]
  role_id uuid [ref: > roles.id, note: "FK to structured role — SET NULL on delete"]
  branch_id uuid [ref: > branches.id, note: "SET NULL on delete"]
  department_id uuid [ref: > departments.id, note: "SET NULL on delete"]
  is_active boolean [default: true]
  is_superuser boolean [default: false]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]
}

// ============================================================
// INVENTORY MODULE
// ============================================================

Table inventory_categories {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  name varchar(255) [not null]
  description text
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    (tenant_id, name) [unique]
  }
}

Table inventory_brands {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  name varchar(255) [not null]
  description text
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    (tenant_id, name) [unique]
  }
}

Table inventory_units {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  name varchar(100) [not null, note: "e.g. Piece, Kilogram, Litre"]
  abbreviation varchar(20) [note: "e.g. pcs, kg, L"]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    (tenant_id, name) [unique]
  }
}

Table inventory_suppliers {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  name varchar(255) [not null]
  email varchar(255)
  phone varchar(50)
  address text
  is_active boolean [default: true]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]
}

Table inventory_products {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  name varchar(255) [not null]
  sku varchar(100) [note: "Stock Keeping Unit — unique per tenant"]
  description text
  image_url varchar(500)
  price numeric(12,2) [default: 0, note: "Selling price — ignored when has_variants=true"]
  cost numeric(12,2) [default: 0, note: "Purchase/cost price — ignored when has_variants=true"]
  stock int [default: 0, note: "Total stock — ignored when has_variants=true"]
  min_stock int [default: 0, note: "Low stock threshold — ignored when has_variants=true"]
  is_active boolean [default: true]
  has_variants boolean [default: false, note: "When true, price/stock live on variants"]
  category_id uuid [ref: > inventory_categories.id, note: "SET NULL on delete"]
  brand_id uuid [ref: > inventory_brands.id, note: "SET NULL on delete"]
  unit_id uuid [ref: > inventory_units.id, note: "SET NULL on delete"]
  supplier_id uuid [ref: > inventory_suppliers.id, note: "SET NULL on delete"]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]
  // NOTE: sku is NOT unique in the DB (model defines no unique constraint)
}

// ------------------------------------------------------------
// Product Variants — size/color/etc variations of a product
// Only used when inventory_products.has_variants = true
// ------------------------------------------------------------
Table inventory_product_variants {
  id uuid [primary key]
  product_id uuid [not null, ref: > inventory_products.id, note: "CASCADE on delete"]
  sku varchar(100) [note: "Unique per product — nullable"]
  attributes json [not null, note: "e.g. {color: Red, size: XL}"]
  price numeric(12,2) [default: 0]
  cost numeric(12,2) [default: 0]
  stock int [default: 0]
  min_stock int [default: 0]
  image_url varchar(500)
  is_active boolean [default: true]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    product_id
    (product_id, sku) [unique, note: "nullable — only enforced when sku is set"]
  }
}

// ============================================================
// SALES MODULE
// ============================================================

// ------------------------------------------------------------
// Customers — people/companies that buy from the tenant
// ------------------------------------------------------------
Table sales_customers {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  name varchar(255) [not null]
  email varchar(255)
  phone varchar(50)
  address text
  customer_type varchar(20) [default: "individual", note: "individual | business"]
  is_active boolean [default: true]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    tenant_id
    (tenant_id, email) [unique, note: "nullable — only enforced when email is set"]
  }
}

// ------------------------------------------------------------
// Deals — CRM-style pipeline (Leads → Closed Won)
// ------------------------------------------------------------
Table sales_deals {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  name varchar(255) [not null, note: "e.g. Enterprise License - Acme Corp"]
  value numeric(14,2) [default: 0, note: "Expected deal value"]
  stage varchar(50) [not null, default: "Leads", note: "Leads | Qualified | Proposal | Negotiation | Closed Won | Closed Lost"]
  probability int [default: 50, note: "0–100 win probability %"]
  customer_id uuid [ref: > sales_customers.id, note: "SET NULL on delete"]
  owner_id uuid [ref: > users.id, note: "Sales rep — SET NULL on delete"]
  expected_close_date date
  notes text
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    tenant_id
    (tenant_id, stage)
    owner_id
  }
}

// ------------------------------------------------------------
// Orders — confirmed sales transactions
// ------------------------------------------------------------
Table sales_orders {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  order_number varchar(50) [not null, note: "e.g. ORD-001 — unique per tenant"]
  customer_id uuid [ref: > sales_customers.id, note: "SET NULL on delete; null = walk-in"]
  deal_id uuid [ref: > sales_deals.id, note: "SET NULL on delete; optional link to deal"]
  branch_id uuid [ref: > branches.id, note: "SET NULL on delete"]
  created_by uuid [ref: > users.id, note: "Staff who created the order — SET NULL"]
  status varchar(20) [not null, default: "Pending", note: "Pending | Completed | Cancelled"]
  subtotal numeric(14,2) [default: 0]
  discount numeric(14,2) [default: 0]
  tax numeric(14,2) [default: 0]
  total numeric(14,2) [default: 0, note: "subtotal - discount + tax"]
  notes text
  ordered_at timestamptz [default: `now()`]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    (tenant_id, order_number) [unique]
    tenant_id
    customer_id
    (tenant_id, status)
  }
}

// ------------------------------------------------------------
// Order Items — line items on each order
// ------------------------------------------------------------
Table sales_order_items {
  id uuid [primary key]
  order_id uuid [not null, ref: > sales_orders.id]
  product_id uuid [ref: > inventory_products.id, note: "SET NULL on delete"]
  variant_id uuid [ref: > inventory_product_variants.id, note: "SET NULL on delete"]
  product_name varchar(255) [not null, note: "Snapshot at time of sale"]
  sku varchar(100) [note: "Snapshot at time of sale"]
  variant_attributes json [note: "Snapshot, e.g. {color: Red, size: XL}"]
  unit_price numeric(12,2) [not null]
  quantity int [not null, default: 1]
  discount numeric(12,2) [default: 0]
  line_total numeric(14,2) [not null, note: "(unit_price * quantity) - discount"]
  created_at timestamptz [default: `now()`]

  indexes {
    order_id
    product_id
    variant_id
  }
}

// ------------------------------------------------------------
// Returns — items returned against a completed order
// ------------------------------------------------------------
Table sales_returns {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  return_number varchar(50) [not null, note: "e.g. RET-001 — unique per tenant"]
  order_id uuid [ref: > sales_orders.id, note: "SET NULL on delete"]
  customer_id uuid [ref: > sales_customers.id, note: "SET NULL on delete"]
  reason text
  refund_amount numeric(14,2) [default: 0]
  status varchar(20) [not null, default: "Pending", note: "Pending | Approved | Rejected"]
  processed_by uuid [ref: > users.id, note: "Staff who processed — SET NULL"]
  return_date date [not null]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    (tenant_id, return_number) [unique]
    tenant_id
    order_id
    (tenant_id, status)
  }
}

// ------------------------------------------------------------
// Return Items — specific products in a return
// ------------------------------------------------------------
Table sales_return_items {
  id uuid [primary key]
  return_id uuid [not null, ref: > sales_returns.id]
  order_item_id uuid [ref: > sales_order_items.id, note: "SET NULL on delete"]
  product_id uuid [ref: > inventory_products.id, note: "SET NULL on delete"]
  product_name varchar(255) [not null, note: "Snapshot"]
  quantity int [not null, default: 1]
  refund_per_unit numeric(12,2) [not null]
  line_refund numeric(14,2) [not null]
  created_at timestamptz [default: `now()`]

  indexes {
    return_id
  }
}

// ------------------------------------------------------------
// Targets — sales goals tracked per period
// ------------------------------------------------------------
Table sales_targets {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  name varchar(255) [not null, note: "e.g. Monthly Revenue, New Customers"]
  target_value numeric(18,2) [not null]
  achieved_value numeric(18,2) [default: 0]
  unit varchar(20) [not null, default: "number", note: "number | currency"]
  period varchar(50) [not null, note: "e.g. July 2025, Q3 2025"]
  assigned_to uuid [ref: > users.id, note: "Sales rep or team lead — SET NULL"]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    tenant_id
    (tenant_id, name, period) [unique]
  }
}

// ============================================================
// FINANCE MODULE
// ============================================================

// ------------------------------------------------------------
// Chart of Accounts — double-entry account definitions
// ------------------------------------------------------------
Table finance_accounts {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  code varchar(20) [not null, note: "e.g. 1000, 4000 — unique per tenant"]
  name varchar(255) [not null, note: "e.g. Cash, Accounts Receivable, Sales Revenue"]
  type varchar(20) [not null, note: "Assets | Liabilities | Equity | Revenue | Expense"]
  normal_balance varchar(6) [not null, note: "debit | credit"]
  description text
  is_active boolean [default: true]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    (tenant_id, code) [unique]
    tenant_id
    (tenant_id, type)
  }
}

// ------------------------------------------------------------
// Transactions — journal entry headers
// Auto-created when: Order→Completed, Return→Approved, Expense→Approved
// ------------------------------------------------------------
Table finance_transactions {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  reference varchar(50) [not null, note: "e.g. TXN-0001 — unique per tenant"]
  type varchar(20) [not null, note: "sale | return | expense | adjustment | manual | purchase"]
  status varchar(10) [not null, default: "Draft", note: "Draft | Posted | Void"]
  transaction_date date [not null]
  description text
  order_id uuid [ref: > sales_orders.id, note: "SET NULL — auto-linked on sale"]
  return_id uuid [ref: > sales_returns.id, note: "SET NULL — auto-linked on return"]
  purchase_id uuid [ref: > purchase_orders.id, note: "SET NULL — auto-linked on purchase receipt"]
  created_by uuid [ref: > users.id, note: "SET NULL on delete"]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    (tenant_id, reference) [unique]
    tenant_id
    order_id
    purchase_id
    (tenant_id, type, status)
  }
}

// ------------------------------------------------------------
// Transaction Lines — debit/credit legs (min 2 per transaction)
// Sum of debits must equal sum of credits per transaction
// ------------------------------------------------------------
Table finance_transaction_lines {
  id uuid [primary key]
  transaction_id uuid [not null, ref: > finance_transactions.id]
  account_id uuid [not null, ref: > finance_accounts.id]
  type varchar(6) [not null, note: "debit | credit"]
  amount numeric(14,2) [not null]
  description varchar(255)
  created_at timestamptz [default: `now()`]

  indexes {
    transaction_id
    account_id
  }
}

// ------------------------------------------------------------
// Expenses — direct expense records
// Approved expense auto-creates a finance_transaction
// ------------------------------------------------------------
Table finance_expenses {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  reference varchar(50) [not null, note: "e.g. EXP-0001 — unique per tenant"]
  title varchar(255) [not null]
  amount numeric(14,2) [not null]
  expense_date date [not null]
  category varchar(50) [not null, note: "Rent | Utilities | Salaries | Supplies | Other"]
  status varchar(10) [not null, default: "Pending", note: "Pending | Approved | Rejected"]
  notes text
  account_id uuid [ref: > finance_accounts.id, note: "SET NULL — expense account hit"]
  order_id uuid [ref: > sales_orders.id, note: "SET NULL — optional link to order"]
  approved_by uuid [ref: > users.id, note: "SET NULL on delete"]
  created_by uuid [ref: > users.id, note: "SET NULL on delete"]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    (tenant_id, reference) [unique]
    tenant_id
    (tenant_id, status)
    account_id
  }
}

// ------------------------------------------------------------
// Budgets — period budget per account
// spent is updated when expense is Approved
// ------------------------------------------------------------
Table finance_budgets {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  account_id uuid [not null, ref: > finance_accounts.id]
  period varchar(20) [not null, note: "e.g. 2025-07 (YYYY-MM)"]
  amount numeric(14,2) [not null, note: "Budgeted amount"]
  spent numeric(14,2) [default: 0, note: "Auto-incremented on expense approval"]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    (tenant_id, account_id, period) [unique]
    tenant_id
    account_id
  }
}

// ------------------------------------------------------------
// Taxes — Rwanda tax configuration & tracking
// ------------------------------------------------------------
Table finance_tax_configs {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  tax_type varchar(50) [not null, note: "vat | paye | withholding | consumption | corporate | personal_income"]
  name varchar(255) [not null]
  rate numeric(10,4) [not null, note: "e.g. 18.00 for VAT"]
  rate_type varchar(20) [not null, default: "percentage", note: "percentage | fixed"]
  min_threshold numeric(14,2) [default: 0]
  max_threshold numeric(14,2) [note: "null = no limit"]
  description text
  is_active boolean [default: true]
  effective_from date [not null]
  effective_to date [note: "null = currently active"]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    (tenant_id, tax_type) [unique]
    tenant_id
    tax_type
  }
}

Table finance_tax_calculations {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  calculation_type varchar(50) [not null, note: "vat | paye | withholding | consumption | corporate | personal_income"]
  reference_type varchar(50) [not null, note: "sale | expense | payroll | manual"]
  reference_id varchar(36) [note: "ID of the related record (no FK)"]
  period varchar(7) [not null, note: "YYYY-MM"]
  taxable_amount numeric(14,2) [not null]
  tax_rate numeric(10,4) [not null]
  tax_amount numeric(14,2) [not null]
  status varchar(20) [not null, default: "Calculated", note: "Calculated | Paid | Void"]
  description text
  paid_at date
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    tenant_id
    period
    (calculation_type, status)
  }
}

Table finance_tax_payments {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  payment_reference varchar(50) [not null]
  tax_type varchar(50) [not null]
  period varchar(7) [not null, note: "YYYY-MM"]
  amount numeric(14,2) [not null]
  payment_date date [not null]
  payment_method varchar(50) [not null, note: "bank_transfer | mobile_money | cash"]
  status varchar(20) [not null, default: "Pending", note: "Pending | Confirmed | Rejected"]
  notes text
  confirmed_at date
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    (tenant_id, payment_reference) [unique]
    tenant_id
    period
  }
}

// ============================================================
// HR MODULE
// ============================================================

// ------------------------------------------------------------
// Employees — staff belonging to a department
// ------------------------------------------------------------
Table hr_employees {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  employee_code varchar(20) [not null]
  first_name varchar(100) [not null]
  last_name varchar(100) [not null]
  email varchar(255)
  phone varchar(50)
  job_title varchar(100)
  department_id uuid [ref: > departments.id, note: "SET NULL on delete"]
  employment_status varchar(20) [default: "Active", note: "Active | On Leave | Terminated"]
  hire_date date
  salary numeric(14,2) [default: 0]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    (tenant_id, employee_code) [unique]
    tenant_id
    department_id
  }
}

Table hr_attendance {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  employee_id uuid [not null, ref: > hr_employees.id, note: "CASCADE on delete"]
  date date [not null]
  check_in varchar(5) [note: "HH:MM"]
  check_out varchar(5) [note: "HH:MM"]
  status varchar(20) [default: "Present", note: "Present | Late | Absent | Half Day"]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    (tenant_id, employee_id, date) [unique]
    tenant_id
    date
  }
}

Table hr_leave_requests {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  employee_id uuid [not null, ref: > hr_employees.id, note: "CASCADE on delete"]
  leave_type varchar(30) [not null, note: "Annual | Sick | Maternity | Unpaid | Study"]
  from_date date [not null]
  to_date date [not null]
  days int [default: 1]
  reason text
  status varchar(20) [default: "Pending", note: "Pending | Approved | Rejected"]
  approved_by uuid [ref: > users.id, note: "SET NULL on delete"]
  approved_at timestamptz
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    tenant_id
    (tenant_id, status)
  }
}

Table hr_payroll_entries {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  employee_id uuid [not null, ref: > hr_employees.id, note: "CASCADE on delete"]
  period varchar(7) [not null, note: "YYYY-MM"]
  base_salary numeric(14,2) [default: 0]
  bonus numeric(14,2) [default: 0]
  deductions numeric(14,2) [default: 0]
  net_pay numeric(14,2) [default: 0]
  status varchar(20) [default: "Pending", note: "Pending | Paid"]
  paid_at timestamptz
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    (tenant_id, employee_id, period) [unique]
    tenant_id
    period
  }
}

Table hr_applicants {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  name varchar(150) [not null]
  email varchar(255)
  phone varchar(50)
  position varchar(100)
  stage varchar(30) [default: "Applied", note: "Applied | Screening | Interview | Offer | Hired | Rejected"]
  applied_date date [not null]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    tenant_id
    (tenant_id, stage)
  }
}

// ============================================================
// PROCUREMENT
// ============================================================
// Purchases are first-class records. Creating one with status "Received"
// stocks inventory in (product/variant) and posts a Posted finance
// transaction (Debit Inventory 1200 / Credit Cash 1000, type=purchase).

Table purchase_orders {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  reference varchar(50) [not null, note: "PUR-0001…"]
  status varchar(20) [default: "Draft", note: "Draft | Received | Cancelled"]
  subtotal numeric(14,2) [default: 0]
  discount numeric(14,2) [default: 0]
  tax numeric(14,2) [default: 0]
  total numeric(14,2) [default: 0]
  notes text
  expected_date date
  received_at timestamptz
  supplier_id uuid [ref: > inventory_suppliers.id, note: "on delete SET NULL"]
  created_by uuid [ref: > users.id, note: "on delete SET NULL"]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    (tenant_id, reference) [unique]
    tenant_id
    supplier_id
    (tenant_id, status)
  }
}

Table purchase_items {
  id uuid [primary key]
  purchase_order_id uuid [not null, ref: > purchase_orders.id, note: "on delete CASCADE"]
  product_id uuid [ref: > inventory_products.id, note: "on delete SET NULL"]
  variant_id uuid [ref: > inventory_product_variants.id, note: "on delete SET NULL"]
  product_name varchar(255) [not null]
  sku varchar(100)
  variant_attributes jsonb
  unit_cost numeric(12,2) [not null]
  quantity integer [not null, default: 1]
  line_total numeric(14,2) [not null]
  created_at timestamptz [default: `now()`]

  indexes {
    purchase_order_id
    product_id
    variant_id
  }
}

// ============================================================
// REPAIRS MODULE
// ============================================================

Table repair_jobs {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  job_number varchar(50) [not null, note: "e.g. REP-0001 — unique per tenant"]
  status varchar(20) [not null, default: "received", note: "received | diagnosing | waiting_parts | in_repair | ready | delivered | cancelled"]
  device_type varchar(100) [not null, note: "e.g. Phone, Laptop, Tablet"]
  device_brand varchar(100)
  device_model varchar(100)
  serial_number varchar(100)
  imei varchar(30)
  device_condition varchar(255)
  reported_issue text [not null]
  diagnosis text
  resolution_notes text
  estimated_cost numeric(12,2) [default: 0]
  final_cost numeric(12,2) [default: 0]
  received_at timestamptz [default: `now()`]
  promised_at timestamptz
  completed_at timestamptz
  customer_id uuid [ref: > sales_customers.id, note: "SET NULL on delete"]
  assigned_to uuid [ref: > users.id, note: "Technician — SET NULL on delete"]
  created_by uuid [ref: > users.id, note: "SET NULL on delete"]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    (tenant_id, job_number) [unique]
    (tenant_id, status)
    (tenant_id, customer_id)
  }
}

Table repair_job_parts {
  id uuid [primary key]
  job_id uuid [not null, ref: > repair_jobs.id, note: "CASCADE on delete"]
  product_id uuid [ref: > inventory_products.id, note: "SET NULL on delete"]
  part_name varchar(255) [not null, note: "Snapshot name"]
  quantity numeric(12,3) [not null, default: 1]
  unit_cost numeric(12,2) [default: 0]
  line_total numeric(14,2) [default: 0]
  created_at timestamptz [default: `now()`]

  indexes {
    job_id
  }
}

// ============================================================
// INVENTORY BATCHES (Expiry & Lot Tracking)
// ============================================================

Table inventory_batches {
  id uuid [primary key]
  tenant_id uuid [not null, ref: > tenants.id]
  product_id uuid [not null, ref: > inventory_products.id, note: "CASCADE on delete"]
  variant_id uuid [ref: > inventory_product_variants.id, note: "SET NULL on delete"]
  purchase_order_id uuid [ref: > purchase_orders.id, note: "SET NULL on delete"]
  batch_number varchar(100) [not null, note: "Lot/batch number — unique per tenant"]
  quantity numeric(14,3) [not null]
  quantity_remaining numeric(14,3) [not null]
  unit_cost numeric(12,2) [default: 0]
  manufactured_date date
  expiry_date date [note: "null = no expiry"]
  received_at timestamptz [default: `now()`]
  supplier_id uuid [ref: > inventory_suppliers.id, note: "SET NULL on delete"]
  notes text
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    (tenant_id, batch_number) [unique]
    (tenant_id, product_id)
    (tenant_id, expiry_date)
  }
}

// ============================================================
// RELATIONSHIPS SUMMARY
// ============================================================

// --- Core: Tenant → org structure ---
Ref: tenants.id < branches.tenant_id
Ref: tenants.id < departments.tenant_id
Ref: tenants.id < roles.tenant_id
Ref: tenants.id < users.tenant_id

// --- Users → org structure ---
Ref: roles.id < users.role_id
Ref: branches.id < users.branch_id
Ref: departments.id < users.department_id

// --- Roles ↔ Permissions (many-to-many) ---
Ref: roles.id < role_permissions.role_id
Ref: permissions.id < role_permissions.permission_id

// --- Tenant → Inventory ---
Ref: tenants.id < inventory_categories.tenant_id
Ref: tenants.id < inventory_brands.tenant_id
Ref: tenants.id < inventory_units.tenant_id
Ref: tenants.id < inventory_suppliers.tenant_id
Ref: tenants.id < inventory_products.tenant_id

// --- Inventory: Product → lookup tables ---
Ref: inventory_categories.id < inventory_products.category_id
Ref: inventory_brands.id < inventory_products.brand_id
Ref: inventory_units.id < inventory_products.unit_id
Ref: inventory_suppliers.id < inventory_products.supplier_id

// --- Inventory: Product Variants ---
Ref: inventory_products.id < inventory_product_variants.product_id

// --- Tenant → Sales ---
Ref: tenants.id < sales_customers.tenant_id
Ref: tenants.id < sales_deals.tenant_id
Ref: tenants.id < sales_orders.tenant_id
Ref: tenants.id < sales_returns.tenant_id
Ref: tenants.id < sales_targets.tenant_id

// --- Sales: Deals ---
Ref: sales_customers.id < sales_deals.customer_id
Ref: users.id < sales_deals.owner_id

// --- Sales: Orders ---
Ref: sales_customers.id < sales_orders.customer_id
Ref: sales_deals.id < sales_orders.deal_id
Ref: branches.id < sales_orders.branch_id
Ref: users.id < sales_orders.created_by

// --- Sales: Order Items ---
Ref: sales_orders.id < sales_order_items.order_id
Ref: inventory_products.id < sales_order_items.product_id
Ref: inventory_product_variants.id < sales_order_items.variant_id

// --- Sales: Returns ---
Ref: sales_orders.id < sales_returns.order_id
Ref: sales_customers.id < sales_returns.customer_id
Ref: users.id < sales_returns.processed_by

// --- Sales: Return Items ---
Ref: sales_returns.id < sales_return_items.return_id
Ref: sales_order_items.id < sales_return_items.order_item_id
Ref: inventory_products.id < sales_return_items.product_id

// --- Sales: Targets ---
Ref: users.id < sales_targets.assigned_to

// --- Tenant → Finance ---
Ref: tenants.id < finance_accounts.tenant_id
Ref: tenants.id < finance_transactions.tenant_id
Ref: tenants.id < finance_expenses.tenant_id
Ref: tenants.id < finance_budgets.tenant_id

// --- Finance: Transactions ---
Ref: sales_orders.id < finance_transactions.order_id
Ref: sales_returns.id < finance_transactions.return_id
Ref: purchase_orders.id < finance_transactions.purchase_id
Ref: users.id < finance_transactions.created_by

// --- Procurement ---
Ref: tenants.id < purchase_orders.tenant_id
Ref: inventory_suppliers.id < purchase_orders.supplier_id
Ref: users.id < purchase_orders.created_by
Ref: purchase_orders.id < purchase_items.purchase_order_id
Ref: inventory_products.id < purchase_items.product_id
Ref: inventory_product_variants.id < purchase_items.variant_id

// --- Finance: Transaction Lines ---
Ref: finance_transactions.id < finance_transaction_lines.transaction_id
Ref: finance_accounts.id < finance_transaction_lines.account_id

// --- Finance: Expenses ---
Ref: finance_accounts.id < finance_expenses.account_id
Ref: sales_orders.id < finance_expenses.order_id
Ref: users.id < finance_expenses.approved_by
Ref: users.id < finance_expenses.created_by

// --- Finance: Budgets ---
Ref: finance_accounts.id < finance_budgets.account_id

// --- Tenant → Tax ---
Ref: tenants.id < finance_tax_configs.tenant_id
Ref: tenants.id < finance_tax_calculations.tenant_id
Ref: tenants.id < finance_tax_payments.tenant_id

// --- Tenant → HR ---
Ref: tenants.id < hr_employees.tenant_id
Ref: tenants.id < hr_attendance.tenant_id
Ref: tenants.id < hr_leave_requests.tenant_id
Ref: tenants.id < hr_payroll_entries.tenant_id
Ref: tenants.id < hr_applicants.tenant_id

// --- HR: Employees ---
Ref: departments.id < hr_employees.department_id
Ref: hr_employees.id < hr_attendance.employee_id
Ref: hr_employees.id < hr_leave_requests.employee_id
Ref: hr_employees.id < hr_payroll_entries.employee_id
Ref: users.id < hr_leave_requests.approved_by
```
