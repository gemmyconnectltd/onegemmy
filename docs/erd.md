```dbml
// OneGemmy ERD — Multi-tenant SaaS Platform
// Docs: https://dbml.dbdiagram.io/docs

Table tenants {
  id uuid [primary key]
  name varchar(255) [not null]
  slug varchar(100) [unique, not null]
  is_active boolean [default: true]
  logo_url varchar(500)
  website varchar(255)
  phone varchar(50)
  address varchar(500)
  city varchar(100)
  country varchar(100)
  subscription_plan varchar(50) [default: 'free']
  subscription_status varchar(50) [default: 'active']
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]
}

Table departments {
  id uuid [primary key]
  tenant_id uuid [not null]
  name varchar(100) [not null]
  description varchar(255)
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    (tenant_id, name) [unique]
  }
}

Table shops {
  id uuid [primary key]
  tenant_id uuid [not null]
  name varchar(255) [not null]
  location varchar(255)
  status varchar(20) [default: 'active']
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]
}

Table roles {
  id uuid [primary key]
  tenant_id uuid [not null]
  name varchar(50) [not null]
  description varchar(255)
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    (tenant_id, name) [unique]
  }
}

Table users {
  id uuid [primary key]
  tenant_id uuid [not null]
  email varchar(255) [not null]
  hashed_password varchar(255) [not null]
  full_name varchar(255) [not null]
  role varchar(50) [default: 'member']
  role_id uuid [ref: > roles.id]
  shop_id uuid [ref: > shops.id]
  department_id uuid [ref: > departments.id]
  is_active boolean [default: true]
  is_superuser boolean [default: false]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]

  indexes {
    (tenant_id, email) [unique]
  }
}

Table permissions {
  id uuid [primary key]
  name varchar(100) [unique, not null]
  description varchar(255)
  resource varchar(50) [not null]
  action varchar(50) [not null]
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]
}

Table role_permissions {
  role_id uuid [ref: > roles.id, not null]
  permission_id uuid [ref: > permissions.id, not null]

  indexes {
    (role_id, permission_id) [unique]
  }
}

// === Relationships ===

Ref: tenants.id < departments.tenant_id
Ref: tenants.id < shops.tenant_id
Ref: tenants.id < roles.tenant_id
Ref: tenants.id < users.tenant_id
Ref: departments.id < users.department_id
Ref: shops.id < users.shop_id
Ref: roles.id < users.role_id
Ref: roles.id < role_permissions.role_id
Ref: permissions.id < role_permissions.permission_id
```
