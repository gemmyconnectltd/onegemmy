```dbml
// OneGemmy ERD — Multi-tenant SaaS Platform
// Docs: https://dbml.dbdiagram.io/docs
// Updated: added Sales module (deals, orders, order_items, returns, targets)

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
  email varchar(255) [unique, not null]
  hashed_password varchar(255) [not null]
  full_name varchar(255) [not null]
  role varchar(50) [default: "member", note: "legacy string role"]
  role_id uuid [ref: > roles.id, note: "FK to structured role"]
  branch_id uuid [ref: > branches.id]
  department_id uuid [ref: > departments.id]
  is_active boolean [default: true]
  is_superuser boolean [default: false]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    (tenant_id, email) [unique]
  }
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
  price numeric(12,2) [default: 0, note: "Selling price"]
  cost numeric(12,2) [default: 0, note: "Purchase/cost price"]
  stock int [default: 0, note: "Current stock quantity"]
  min_stock int [default: 0, note: "Low stock alert threshold"]
  is_active boolean [default: true]
  category_id uuid [ref: > inventory_categories.id, note: "SET NULL on delete"]
  brand_id uuid [ref: > inventory_brands.id, note: "SET NULL on delete"]
  unit_id uuid [ref: > inventory_units.id, note: "SET NULL on delete"]
  supplier_id uuid [ref: > inventory_suppliers.id, note: "SET NULL on delete"]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    (tenant_id, sku) [unique]
    tenant_id
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
  product_name varchar(255) [not null, note: "Snapshot at time of sale"]
  sku varchar(100) [note: "Snapshot at time of sale"]
  unit_price numeric(12,2) [not null]
  quantity int [not null, default: 1]
  discount numeric(12,2) [default: 0]
  line_total numeric(14,2) [not null, note: "(unit_price * quantity) - discount"]
  created_at timestamptz [default: `now()`]

  indexes {
    order_id
    product_id
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
```
