# Software Requirements Specification (SRS)
## OneGemmy — Frontend
### Version 1.0 | Business Management Tool

---

## 1. Introduction

### 1.1 Purpose
This document defines the software requirements for the **OneGemmy** frontend — a modern, responsive web application serving as the user interface for a comprehensive business management tool.

### 1.2 Scope
The frontend provides dashboards, data visualization, form inputs, and interactive components for managing business operations including finances, inventory, employees, projects, CRM, and reporting.

### 1.3 Tech Stack
- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **State Management:** React Context / Zustand
- **HTTP Client:** Axios / Fetch API
- **Charts:** Recharts / Chart.js
- **Forms:** React Hook Form + Zod validation
- **Auth:** NextAuth.js / JWT token-based

---

## 2. Overall Description

### 2.1 Product Perspective
The frontend is a Single Page Application (SPA) that communicates with the OneGemmy backend API. It handles all user interactions, renders data, and manages client-side routing.

### 2.2 User Classes
| Role | Description |
|------|-------------|
| **Super Admin** | Full system access, manages all modules and users |
| **Admin** | Manages business operations, views reports |
| **Manager** | Manages team, projects, and department data |
| **Employee** | Limited access to personal and assigned tasks |
| **Accountant** | Financial data entry, invoicing, expense tracking |

### 2.3 Design & UX Principles
- Responsive design (mobile, tablet, desktop)
- Dark/Light theme support
- Accessible (WCAG 2.1 AA compliant)
- Consistent design system with reusable components
- Loading skeletons and error boundaries

---

## 3. Functional Requirements

### 3.1 Authentication & Authorization
- **FR-AUTH-001:** Login page with email/password
- **FR-AUTH-002:** Registration page for new users (admin approval required)
- **FR-AUTH-003:** Forgot/reset password flow via email
- **FR-AUTH-004:** Role-based route protection
- **FR-AUTH-005:** Session management with auto-refresh tokens
- **FR-AUTH-006:** Two-factor authentication (TOTP)
- **FR-AUTH-007:** Profile management (avatar, name, password)

### 3.2 Dashboard
- **FR-DASH-001:** Overview dashboard with KPI widgets (revenue, expenses, profit, tasks)
- **FR-DASH-002:** Real-time notifications panel
- **FR-DASH-003:** Activity feed / recent actions
- **FR-DASH-004:** Quick-action buttons (create invoice, add employee, etc.)
- **FR-DASH-005:** Date range filters for dashboard data
- **FR-DASH-006:** Role-specific dashboard views

### 3.3 Financial Management
- **FR-FIN-001:** Invoice creation, editing, and PDF export
- **FR-FIN-002:** Expense tracking with category tagging
- **FR-FIN-003:** Revenue tracking and reconciliation
- **FR-FIN-004:** Payment status tracking (paid, pending, overdue)
- **FR-FIN-005:** Financial reports (P&L, balance sheet, cash flow)
- **FR-FIN-006:** Tax calculation and summaries
- **FR-FIN-007:** Budget management and alerts

### 3.4 Inventory Management
- **FR-INV-001:** Product catalog with categories and search
- **FR-INV-002:** Stock level tracking with low-stock alerts
- **FR-INV-003:** Purchase order creation and tracking
- **FR-INV-004:** Barcode/QR code generation and scanning
- **FR-INV-005:** Warehouse/location management
- **FR-INV-006:** Inventory valuation reports

### 3.5 Human Resources (HR)
- **FR-HR-001:** Employee directory with profiles
- **FR-HR-002:** Attendance tracking and timesheets
- **FR-HR-003:** Leave management (request, approve, reject)
- **FR-HR-004:** Payroll summary view
- **FR-HR-005:** Performance reviews
- **FR-HR-006:** Department and designation management
- **FR-HR-007:** Document management (contracts, IDs)

### 3.6 Project Management
- **FR-PM-001:** Project creation with milestones and deadlines
- **FR-PM-002:** Kanban board view for tasks
- **FR-PM-003:** Gantt chart view
- **FR-PM-004:** Task assignment with priority and status
- **FR-PM-005:** Time tracking per task
- **FR-PM-006:** Team collaboration (comments, file attachments)
- **FR-PM-007:** Project progress tracking with visual indicators

### 3.7 Customer Relationship Management (CRM)
- **FR-CRM-001:** Lead management pipeline
- **FR-CRM-002:** Contact/customer profiles with interaction history
- **FR-CRM-003:** Deal/opportunity tracking
- **FR-CRM-004:** Email integration for communication logging
- **FR-CRM-005:** Follow-up reminders and task scheduling
- **FR-CRM-006:** Sales funnel visualization

### 3.8 Reporting & Analytics
- **FR-RPT-001:** Customizable report builder
- **FR-RPT-002:** Export reports (PDF, CSV, Excel)
- **FR-RPT-003:** Scheduled report generation and email delivery
- **FR-RPT-004:** Comparative analysis (period-over-period)
- **FR-RPT-005:** Data visualization (charts, graphs, heatmaps)

### 3.9 Settings & Configuration
- **FR-SET-001:** Company profile and branding (logo, colors)
- **FR-SET-002:** Role and permission management
- **FR-SET-003:** Notification preferences (email, push, in-app)
- **FR-SET-004:** Integrations management (payment gateways, email providers)
- **FR-SET-005:** Currency and locale settings
- **FR-SET-006:** Audit log viewer

### 3.10 UI Components
- **FR-UI-001:** Sidebar navigation with collapsible menu
- **FR-UI-002:** Top navigation bar with search, notifications, and user menu
- **FR-UI-003:** Data tables with sorting, filtering, pagination
- **FR-UI-004:** Modal dialogs and drawer panels
- **FR-UI-005:** Toast notifications (success, error, warning, info)
- **FR-UI-006:** Form components with validation feedback
- **FR-UI-007:** Empty states and error states
- **FR-UI-008:** Skeleton loading components
- **FR-UI-009:** Breadcrumb navigation
- **FR-UI-010:** Responsive grid system

---

## 4. Non-Functional Requirements

### 4.1 Performance
- **NFR-PERF-001:** Initial page load < 3 seconds on 3G
- **NFR-PERF-002:** Route transitions < 500ms
- **NFR-PERF-003:** API response rendering < 200ms
- **NFR-PERF-004:** Lighthouse score > 80
- **NFR-PERF-005:** Support 500+ concurrent users

### 4.2 Security
- **NFR-SEC-001:** XSS protection via input sanitization
- **NFR-SEC-002:** CSRF token validation
- **NFR-SEC-003:** Secure HTTP-only cookie storage for tokens
- **NFR-SEC-004:** Content Security Policy (CSP) headers
- **NFR-SEC-005:** Sensitive data not stored in localStorage

### 4.3 Accessibility
- **NFR-ACC-001:** WCAG 2.1 AA compliance
- **NFR-ACC-002:** Keyboard navigation for all interactive elements
- **NFR-ACC-003:** Screen reader compatible with ARIA labels
- **NFR-ACC-004:** Color contrast ratios ≥ 4.5:1

### 4.4 Compatibility
- **NFR-COMP-001:** Chrome, Firefox, Safari, Edge (latest 2 versions)
- **NFR-COMP-002:** Responsive: 320px to 2560px width
- **NFR-COMP-003:** iOS Safari 15+, Android Chrome 10+

### 4.5 Reliability
- **NFR-REL-001:** Error boundaries on all page routes
- **NFR-REL-002:** Graceful degradation when API is unavailable
- **NFR-REL-003:** Offline fallback for cached data (service worker)

---

## 5. Page/Route Structure

```
/                          → Dashboard (role-based)
/login                     → Login page
/register                  → Registration page
/forgot-password           → Password reset request
/reset-password            → Password reset form

/dashboard                 → Main dashboard
/dashboard/finance         → Financial overview
/dashboard/inventory       → Inventory overview
/dashboard/hr              → HR overview
/dashboard/projects        → Projects overview
/dashboard/crm             → CRM overview

/finance/invoices          → Invoice list
/finance/invoices/new      → Create invoice
/finance/invoices/[id]     → Invoice detail/edit
/finance/expenses          → Expense tracking
/finance/reports           → Financial reports

/inventory/products        → Product list
/inventory/products/new    → Add product
/inventory/stock           → Stock management
/inventory/purchases       → Purchase orders

/hr/employees              → Employee directory
/hr/employees/[id]         → Employee profile
/hr/attendance             → Attendance tracking
/hr/leave                  → Leave management
/hr/payroll                → Payroll overview

/projects                  → Project list
/projects/[id]             → Project detail (Kanban)
/projects/[id]/gantt       → Gantt chart view

/crm/leads                 → Lead pipeline
/crm/contacts              → Contact list
/crm/deals                 → Deal tracking

/reports                   → Report center
/settings                  → Settings overview
/settings/company          → Company profile
/settings/team             → Team & roles
/settings/integrations     → Integrations
/settings/audit-log        → Audit log
```

---

## 6. API Integration Points

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/login` | POST | User authentication |
| `/api/auth/register` | POST | User registration |
| `/api/auth/refresh` | POST | Token refresh |
| `/api/dashboard/summary` | GET | Dashboard KPI data |
| `/api/invoices` | CRUD | Invoice management |
| `/api/expenses` | CRUD | Expense management |
| `/api/products` | CRUD | Product/inventory management |
| `/api/employees` | CRUD | Employee management |
| `/api/projects` | CRUD | Project management |
| `/api/tasks` | CRUD | Task management |
| `/api/contacts` | CRUD | CRM contacts |
| `/api/deals` | CRUD | CRM deals |
| `/api/reports/*` | GET | Report generation |
| `/api/settings` | GET/PUT | Settings management |

---

## 7. Data Validation (Frontend)

| Field | Rule |
|-------|------|
| Email | Valid email format, max 255 chars |
| Password | Min 8 chars, 1 uppercase, 1 number, 1 special |
| Phone | E.164 format |
| Name | 2-100 chars, no special characters |
| Currency | 2 decimal places |
| Date | ISO 8601 format |
| File Upload | Max 10MB, allowed: jpg, png, pdf, csv |

---

## 8. State Management Structure

```
Global State (Zustand/Context)
├── Auth State
│   ├── user
│   ├── token
│   ├── role
│   └── permissions
├── UI State
│   ├── theme (light/dark)
│   ├── sidebar collapsed
│   ├── active modal
│   └── notification count
└── Data State
    ├── dashboard summary
    ├── filters
    └── cached queries
```

---

## 9. Acceptance Criteria

1. All pages render without errors in production build
2. Authentication flow works end-to-end (login → dashboard → logout)
3. All CRUD operations reflect changes in real-time
4. Responsive layout works on mobile (375px), tablet (768px), desktop (1440px)
5. Dark/light theme persists across sessions
6. All forms validate before submission
7. Error states display user-friendly messages
8. Loading states shown during API calls
9. All routes are protected based on user role
10. Accessibility audit passes with no critical violations

---

*Document prepared for OneGemmy Business Management Tool*
