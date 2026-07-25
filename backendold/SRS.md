# Software Requirements Specification (SRS)
## OneGemmy — Backend
### Version 1.0 | Business Management Tool

---

## 1. Introduction

### 1.1 Purpose
This document defines the software requirements for the **OneGemmy** backend — a RESTful API server providing all business logic, data persistence, authentication, and integrations for the business management tool.

### 1.2 Scope
The backend handles all server-side operations including user management, financial processing, inventory control, HR operations, project management, CRM functionality, reporting, and third-party integrations.

### 1.3 Tech Stack
- **Runtime:** Node.js 20+
- **Framework:** Express.js / Fastify
- **Language:** TypeScript
- **Database:** PostgreSQL 16+
- **ORM:** Prisma / Drizzle
- **Cache:** Redis 7+
- **Queue:** BullMQ (Redis-backed)
- **Auth:** JWT (access + refresh tokens), bcrypt
- **Validation:** Zod
- **File Storage:** AWS S3 / MinIO
- **Email:** Nodemailer / SendGrid
- **Docs:** Swagger/OpenAPI 3.0
- **Testing:** Jest + Supertest

---

## 2. Overall Description

### 2.1 System Architecture
```
Client (Frontend)
      │
      ▼
  API Gateway / Load Balancer
      │
      ▼
  Express/Fastify Server
      │
      ├── Auth Middleware (JWT verification)
      ├── RBAC Middleware (role/permission check)
      ├── Rate Limiter (per user/IP)
      │
      ▼
  Controllers → Services → Repositories (Prisma)
      │              │
      │              ▼
      │          Redis Cache
      │
      ├── PostgreSQL (primary DB)
      ├── Redis (cache, sessions, queues)
      ├── S3 (file storage)
      └── BullMQ (background jobs)
```

### 2.2 User Roles & Permissions Matrix

| Permission | Super Admin | Admin | Manager | Employee | Accountant |
|------------|:-----------:|:-----:|:-------:|:--------:|:----------:|
| Manage Users | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage Roles | ✅ | ❌ | ❌ | ❌ | ❌ |
| View Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage Invoices | ✅ | ✅ | ✅ | ❌ | ✅ |
| Manage Expenses | ✅ | ✅ | ✅ | ❌ | ✅ |
| Manage Inventory | ✅ | ✅ | ✅ | ❌ | ❌ |
| Manage Employees | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage Projects | ✅ | ✅ | ✅ | ✅ | ❌ |
| Manage CRM | ✅ | ✅ | ✅ | ❌ | ❌ |
| View Reports | ✅ | ✅ | ✅ | ❌ | ✅ |
| System Settings | ✅ | ❌ | ❌ | ❌ | ❌ |
| Audit Logs | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 3. Database Schema

### 3.1 Core Tables

#### users
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| email | VARCHAR(255) | UNIQUE, NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL |
| first_name | VARCHAR(100) | NOT NULL |
| last_name | VARCHAR(100) | NOT NULL |
| phone | VARCHAR(20) | NULLABLE |
| avatar_url | TEXT | NULLABLE |
| role_id | UUID | FK → roles.id |
| is_active | BOOLEAN | DEFAULT true |
| last_login_at | TIMESTAMP | NULLABLE |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |

#### roles
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| name | VARCHAR(50) | UNIQUE, NOT NULL |
| description | TEXT | NULLABLE |
| permissions | JSONB | NOT NULL |
| created_at | TIMESTAMP | DEFAULT NOW() |

#### companies
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| name | VARCHAR(255) | NOT NULL |
| logo_url | TEXT | NULLABLE |
| email | VARCHAR(255) | NULLABLE |
| phone | VARCHAR(20) | NULLABLE |
| address | TEXT | NULLABLE |
| tax_id | VARCHAR(50) | NULLABLE |
| currency | VARCHAR(3) | DEFAULT 'USD' |
| owner_id | UUID | FK → users.id |
| created_at | TIMESTAMP | DEFAULT NOW() |

#### invoices
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| invoice_number | VARCHAR(50) | UNIQUE, NOT NULL |
| company_id | UUID | FK → companies.id |
| client_id | UUID | FK → contacts.id |
| issued_date | DATE | NOT NULL |
| due_date | DATE | NOT NULL |
| status | ENUM | draft, sent, paid, overdue, cancelled |
| subtotal | DECIMAL(12,2) | NOT NULL |
| tax_rate | DECIMAL(5,2) | DEFAULT 0 |
| tax_amount | DECIMAL(12,2) | DEFAULT 0 |
| total | DECIMAL(12,2) | NOT NULL |
| notes | TEXT | NULLABLE |
| created_by | UUID | FK → users.id |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |

#### invoice_items
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| invoice_id | UUID | FK → invoices.id, ON DELETE CASCADE |
| description | VARCHAR(255) | NOT NULL |
| quantity | DECIMAL(10,2) | NOT NULL |
| unit_price | DECIMAL(12,2) | NOT NULL |
| amount | DECIMAL(12,2) | NOT NULL |

#### expenses
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| company_id | UUID | FK → companies.id |
| category_id | UUID | FK → expense_categories.id |
| amount | DECIMAL(12,2) | NOT NULL |
| description | VARCHAR(255) | NOT NULL |
| date | DATE | NOT NULL |
| receipt_url | TEXT | NULLABLE |
| status | ENUM | pending, approved, rejected |
| created_by | UUID | FK → users.id |
| created_at | TIMESTAMP | DEFAULT NOW() |

#### expense_categories
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| company_id | UUID | FK → companies.id |
| name | VARCHAR(100) | NOT NULL |
| budget_limit | DECIMAL(12,2) | NULLABLE |

#### products
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| company_id | UUID | FK → companies.id |
| name | VARCHAR(255) | NOT NULL |
| sku | VARCHAR(100) | UNIQUE |
| description | TEXT | NULLABLE |
| category | VARCHAR(100) | NULLABLE |
| price | DECIMAL(12,2) | NOT NULL |
| cost | DECIMAL(12,2) | NULLABLE |
| quantity | INTEGER | DEFAULT 0 |
| min_stock | INTEGER | DEFAULT 0 |
| image_url | TEXT | NULLABLE |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |

#### employees
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | FK → users.id, UNIQUE |
| company_id | UUID | FK → companies.id |
| department_id | UUID | FK → departments.id |
| designation | VARCHAR(100) | NOT NULL |
| hire_date | DATE | NOT NULL |
| salary | DECIMAL(12,2) | NULLABLE |
| status | ENUM | active, on_leave, terminated |
| created_at | TIMESTAMP | DEFAULT NOW() |

#### departments
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| company_id | UUID | FK → companies.id |
| name | VARCHAR(100) | NOT NULL |
| head_id | UUID | FK → employees.id, NULLABLE |

#### projects
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| company_id | UUID | FK → companies.id |
| name | VARCHAR(255) | NOT NULL |
| description | TEXT | NULLABLE |
| status | ENUM | planning, in_progress, on_hold, completed, cancelled |
| priority | ENUM | low, medium, high, urgent |
| start_date | DATE | NULLABLE |
| end_date | DATE | NULLABLE |
| budget | DECIMAL(12,2) | NULLABLE |
| created_by | UUID | FK → users.id |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |

#### tasks
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| project_id | UUID | FK → projects.id |
| title | VARCHAR(255) | NOT NULL |
| description | TEXT | NULLABLE |
| status | ENUM | todo, in_progress, review, done |
| priority | ENUM | low, medium, high, urgent |
| assignee_id | UUID | FK → users.id, NULLABLE |
| due_date | DATE | NULLABLE |
| estimated_hours | DECIMAL(6,2) | NULLABLE |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |

#### contacts
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| company_id | UUID | FK → companies.id |
| type | ENUM | lead, customer, vendor |
| first_name | VARCHAR(100) | NOT NULL |
| last_name | VARCHAR(100) | NOT NULL |
| email | VARCHAR(255) | NULLABLE |
| phone | VARCHAR(20) | NULLABLE |
| company_name | VARCHAR(255) | NULLABLE |
| notes | TEXT | NULLABLE |
| created_at | TIMESTAMP | DEFAULT NOW() |

#### deals
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| company_id | UUID | FK → companies.id |
| contact_id | UUID | FK → contacts.id |
| title | VARCHAR(255) | NOT NULL |
| value | DECIMAL(12,2) | NOT NULL |
| stage | ENUM | prospecting, qualification, proposal, negotiation, closed_won, closed_lost |
| expected_close_date | DATE | NULLABLE |
| assigned_to | UUID | FK → users.id |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |

#### activity_logs
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | FK → users.id |
| company_id | UUID | FK → companies.id |
| action | VARCHAR(100) | NOT NULL |
| entity_type | VARCHAR(50) | NOT NULL |
| entity_id | UUID | NOT NULL |
| details | JSONB | NULLABLE |
| ip_address | INET | NULLABLE |
| created_at | TIMESTAMP | DEFAULT NOW() |

---

## 4. Functional Requirements — API Endpoints

### 4.1 Authentication (`/api/auth`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/auth/register` | Register new user | No |
| POST | `/auth/login` | Login and get tokens | No |
| POST | `/auth/refresh` | Refresh access token | Refresh Token |
| POST | `/auth/logout` | Invalidate refresh token | Yes |
| POST | `/auth/forgot-password` | Send reset email | No |
| POST | `/auth/reset-password` | Reset password with token | No |
| GET | `/auth/me` | Get current user profile | Yes |
| PUT | `/auth/me` | Update profile | Yes |
| PUT | `/auth/change-password` | Change password | Yes |

### 4.2 Users (`/api/users`)

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/users` | List all users (paginated) | Admin+ |
| GET | `/users/:id` | Get user by ID | Admin+ |
| POST | `/users` | Create new user | Admin+ |
| PUT | `/users/:id` | Update user | Admin+ |
| DELETE | `/users/:id` | Deactivate user | Super Admin |
| PUT | `/users/:id/role` | Assign role | Super Admin |

### 4.3 Companies (`/api/companies`)

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/companies/current` | Get current company | Admin+ |
| PUT | `/companies/current` | Update company profile | Admin+ |
| POST | `/companies` | Create company | Super Admin |

### 4.4 Financial — Invoices (`/api/invoices`)

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/invoices` | List invoices (filterable, paginated) | Admin+ |
| GET | `/invoices/:id` | Get invoice with items | Admin+ |
| POST | `/invoices` | Create invoice | Accountant+ |
| PUT | `/invoices/:id` | Update invoice | Accountant+ |
| DELETE | `/invoices/:id` | Delete draft invoice | Admin+ |
| PUT | `/invoices/:id/status` | Update status (sent, paid, etc.) | Accountant+ |
| GET | `/invoices/:id/pdf` | Generate/download PDF | Accountant+ |

### 4.5 Financial — Expenses (`/api/expenses`)

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/expenses` | List expenses (filterable) | Accountant+ |
| GET | `/expenses/:id` | Get expense detail | Accountant+ |
| POST | `/expenses` | Create expense | Accountant+ |
| PUT | `/expenses/:id` | Update expense | Accountant+ |
| DELETE | `/expenses/:id` | Delete expense | Admin+ |
| PUT | `/expenses/:id/approve` | Approve/reject expense | Manager+ |

### 4.6 Inventory (`/api/products`)

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/products` | List products (searchable) | Manager+ |
| GET | `/products/:id` | Get product detail | Manager+ |
| POST | `/products` | Create product | Manager+ |
| PUT | `/products/:id` | Update product | Manager+ |
| DELETE | `/products/:id` | Remove product | Admin+ |
| PUT | `/products/:id/stock` | Adjust stock levels | Manager+ |
| GET | `/products/low-stock` | Low stock alerts | Manager+ |

### 4.7 HR — Employees (`/api/employees`)

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/employees` | List employees | Admin+ |
| GET | `/employees/:id` | Get employee profile | Admin+ |
| POST | `/employees` | Add employee | Admin+ |
| PUT | `/employees/:id` | Update employee | Admin+ |
| PUT | `/employees/:id/status` | Update employment status | Admin+ |

### 4.8 HR — Attendance (`/api/attendance`)

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/attendance` | List attendance records | Manager+ |
| POST | `/attendance/check-in` | Check in | All Employees |
| PUT | `/attendance/check-out` | Check out | All Employees |
| GET | `/attendance/my` | My attendance history | All Employees |

### 4.9 HR — Leave (`/api/leave`)

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/leave` | List leave requests | Manager+ |
| POST | `/leave` | Request leave | All Employees |
| PUT | `/leave/:id/approve` | Approve/reject leave | Manager+ |
| GET | `/leave/balance` | My leave balance | All Employees |

### 4.10 Projects (`/api/projects`)

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/projects` | List projects | Manager+ |
| GET | `/projects/:id` | Get project with tasks | Manager+ |
| POST | `/projects` | Create project | Manager+ |
| PUT | `/projects/:id` | Update project | Manager+ |
| DELETE | `/projects/:id` | Delete project | Admin+ |

### 4.11 Tasks (`/api/tasks`)

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/tasks` | List tasks (filterable) | Manager+ |
| POST | `/tasks` | Create task | Manager+ |
| PUT | `/tasks/:id` | Update task | Assignee+ |
| PUT | `/tasks/:id/status` | Update task status | Assignee+ |
| DELETE | `/tasks/:id` | Delete task | Manager+ |

### 4.12 CRM — Contacts (`/api/contacts`)

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/contacts` | List contacts (searchable) | Manager+ |
| GET | `/contacts/:id` | Get contact with history | Manager+ |
| POST | `/contacts` | Create contact | Manager+ |
| PUT | `/contacts/:id` | Update contact | Manager+ |
| DELETE | `/contacts/:id` | Delete contact | Admin+ |

### 4.13 CRM — Deals (`/api/deals`)

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/deals` | List deals (pipeline view) | Manager+ |
| GET | `/deals/:id` | Get deal detail | Manager+ |
| POST | `/deals` | Create deal | Manager+ |
| PUT | `/deals/:id` | Update deal | Manager+ |
| PUT | `/deals/:id/stage` | Move deal stage | Manager+ |
| DELETE | `/deals/:id` | Delete deal | Admin+ |

### 4.14 Reports (`/api/reports`)

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/reports/financial/summary` | Financial summary | Admin+ |
| GET | `/reports/financial/profit-loss` | P&L report | Admin+ |
| GET | `/reports/inventory/valuation` | Inventory valuation | Admin+ |
| GET | `/reports/hr/attendance-summary` | Attendance summary | Manager+ |
| GET | `/reports/projects/progress` | Project progress | Manager+ |
| GET | `/reports/crm/sales-funnel` | Sales funnel | Manager+ |
| POST | `/reports/custom` | Generate custom report | Admin+ |

### 4.15 Settings (`/api/settings`)

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/settings` | Get all settings | Admin+ |
| PUT | `/settings` | Update settings | Super Admin |
| GET | `/settings/roles` | List roles | Super Admin |
| POST | `/settings/roles` | Create custom role | Super Admin |

### 4.16 Audit Logs (`/api/audit`)

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/audit` | List audit logs (paginated) | Admin+ |

---

## 5. Non-Functional Requirements

### 5.1 Performance
- **NFR-PERF-001:** API response time < 200ms (95th percentile)
- **NFR-PERF-002:** Support 1000+ concurrent connections
- **NFR-PERF-003:** Database query execution < 100ms for indexed queries
- **NFR-PERF-004:** Redis cache hit ratio > 80% for frequently accessed data
- **NFR-PERF-005:** Bulk operations (1000+ records) complete < 5 seconds

### 5.2 Security
- **NFR-SEC-001:** Passwords hashed with bcrypt (12 salt rounds)
- **NFR-SEC-002:** JWT access tokens expire in 15 minutes
- **NFR-SEC-003:** Refresh tokens expire in 7 days, stored server-side in Redis
- **NFR-SEC-004:** Rate limiting: 100 requests/minute per user
- **NFR-SEC-005:** All inputs validated with Zod schemas
- **NFR-SEC-006:** SQL injection prevention via parameterized queries (Prisma)
- **NFR-SEC-007:** CORS configured for allowed origins only
- **NFR-SEC-008:** Helmet.js security headers
- **NFR-SEC-009:** Sensitive data encrypted at rest (AES-256)
- **NFR-SEC-010:** API key rotation support for integrations

### 5.3 Reliability & Availability
- **NFR-REL-001:** 99.9% uptime SLA
- **NFR-REL-002:** Graceful shutdown handling (SIGTERM)
- **NFR-REL-003:** Automatic database connection retry with backoff
- **NFR-REL-004:** Dead letter queue for failed jobs
- **NFR-REL-005:** Health check endpoint (`/api/health`)

### 5.4 Scalability
- **NFR-SCA-001:** Horizontal scaling via stateless design
- **NFR-SCA-002:** Database connection pooling (PgBouncer)
- **NFR-SCA-003:** Background job processing for heavy tasks
- **NFR-SCA-004:** Pagination for all list endpoints (max 100 per page)

### 5.5 Observability
- **NFR-OBS-001:** Structured JSON logging (Winston/Pino)
- **NFR-OBS-002:** Request ID tracking across services
- **NFR-OBS-003:** Error tracking integration (Sentry)
- **NFR-OBS-004:** Performance monitoring (response times, DB queries)
- **NFR-OBS-005:** Audit trail for all data mutations

---

## 6. Background Jobs (BullMQ)

| Job | Trigger | Description |
|-----|---------|-------------|
| `send-email` | Event | Send transactional emails (welcome, reset, notifications) |
| `generate-pdf` | On-demand | Generate invoice/report PDFs |
| `low-stock-alert` | Cron (daily) | Check and notify low stock items |
| `overdue-invoice-alert` | Cron (daily) | Notify overdue invoices |
| `report-generation` | Scheduled | Generate and cache scheduled reports |
| `data-export` | On-demand | Export large datasets to CSV/Excel |
| `cleanup-tokens` | Cron (hourly) | Remove expired refresh tokens |

---

## 7. Caching Strategy (Redis)

| Key Pattern | TTL | Invalidation |
|-------------|-----|--------------|
| `user:{id}` | 15 min | On user update |
| `company:{id}` | 30 min | On company update |
| `dashboard:{companyId}` | 5 min | On data mutation |
| `products:{companyId}` | 10 min | On product CRUD |
| `reports:{type}:{companyId}` | 15 min | On relevant data change |
| `session:{userId}` | 7 days | On logout |

---

## 8. Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "email",
        "message": "Must be a valid email address"
      }
    ]
  },
  "requestId": "uuid-v4"
}
```

### Error Codes
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Input validation failed |
| `UNAUTHORIZED` | 401 | Not authenticated |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

## 9. Success Response Format

```json
{
  "success": true,
  "data": { },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  },
  "requestId": "uuid-v4"
}
```

---

## 10. Testing Requirements

### Unit Tests
- All service/business logic functions
- All utility/helper functions
- Validation schemas

### Integration Tests
- All API endpoints
- Database operations (test DB)
- Redis operations
- Authentication/authorization flows

### Test Coverage
- Minimum 80% code coverage
- All critical paths tested
- Error scenarios covered

---

*Document prepared for OneGemmy Business Management Tool*
