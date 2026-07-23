from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
import os

WIDTH, HEIGHT = landscape(A4)
OUTPUT = os.path.join(os.path.dirname(__file__), "..", "docs", "onegemmy_erd_multitenancy.pdf")
os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)

BG = colors.HexColor("#ffffff")
ACCENT = colors.HexColor("#6f1a07")
PRIMARY = colors.HexColor("#af9164")
TEXT = colors.HexColor("#2b2118")
MUTED = colors.HexColor("#b3b6b7")
BORDER = colors.HexColor("#e8e4de")
TABLE_BG = colors.HexColor("#f8f8f6")
HEADER_BG = colors.HexColor("#6f1a07")
HEADER_FG = colors.white
PK_COLOR = colors.HexColor("#af9164")
FK_COLOR = colors.HexColor("#6f1a07")

c = canvas.Canvas(OUTPUT, pagesize=landscape(A4))
c.setTitle("OneGemmy - ERD & Multi-Tenancy Architecture")
c.setAuthor("Gemmy Connect Ltd")

def header_bar(title):
    c.setFillColor(BG)
    c.rect(0, 0, WIDTH, HEIGHT, fill=1)
    c.setFillColor(ACCENT)
    c.rect(0, HEIGHT - 12*mm, WIDTH, 12*mm, fill=1)
    c.setFillColor(HEADER_FG)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(20*mm, HEIGHT - 9*mm, title)

def footer():
    c.setFillColor(PRIMARY)
    c.rect(0, 6*mm, WIDTH, 1.5*mm, fill=1)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7)
    c.drawRightString(WIDTH - 20*mm, 2*mm, "OneGemmy  |  Gemmy Connect Ltd")

def draw_table(x, y, name, cols, w=75*mm):
    row_h = 6.5*mm
    header_h = 8*mm
    total_h = header_h + len(cols) * row_h

    # shadow
    c.setFillColor(colors.HexColor("#00000006"))
    c.rect(x + 1.2*mm, y - total_h + 1.2*mm, w, total_h, fill=1, stroke=0)

    # body
    c.setFillColor(TABLE_BG)
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.5)
    c.rect(x, y - total_h, w, total_h, fill=1, stroke=1)

    # header
    c.setFillColor(HEADER_BG)
    c.rect(x, y - header_h, w, header_h, fill=1, stroke=0)
    c.setFillColor(HEADER_FG)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawCentredString(x + w/2, y - header_h + 2.5*mm, name)

    # rows
    ry = y - header_h
    for i, (col_name, col_type, col_note) in enumerate(cols):
        ry -= row_h
        if i % 2 == 0:
            c.setFillColor(colors.HexColor("#fafaf8"))
            c.rect(x + 0.3*mm, ry, w - 0.6*mm, row_h, fill=1, stroke=0)

        is_pk = "PK" in col_note
        is_fk = "FK" in col_note

        if is_pk:
            c.setFillColor(PK_COLOR)
            c.setFont("Helvetica-Bold", 8)
        elif is_fk:
            c.setFillColor(FK_COLOR)
            c.setFont("Helvetica-Bold", 8)
        else:
            c.setFillColor(TEXT)
            c.setFont("Helvetica", 8)
        c.drawString(x + 3*mm, ry + 1.8*mm, col_name)

        c.setFillColor(MUTED)
        c.setFont("Helvetica", 7)
        c.drawString(x + 34*mm, ry + 1.8*mm, col_type)

        if col_note:
            if is_fk: c.setFillColor(FK_COLOR)
            elif is_pk: c.setFillColor(PK_COLOR)
            else: c.setFillColor(MUTED)
            c.setFont("Helvetica", 6.5)
            c.drawRightString(x + w - 2*mm, ry + 1.8*mm, col_note)

    return x, y, w, total_h

def draw_rel(x1, y1, x2, y2, label=""):
    c.setStrokeColor(PRIMARY)
    c.setLineWidth(0.8)
    c.setDash(4, 2)
    c.line(x1, y1, x2, y2)
    c.setDash()
    c.setFillColor(PRIMARY)
    c.circle(x2, y2, 1.5*mm, fill=1, stroke=0)
    if label:
        mx, my = (x1+x2)/2, (y1+y2)/2
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 6)
        c.drawCentredString(mx, my + 2.5*mm, label)

# ══════════════════════════════════════════════════════════
# PAGE 1 — TITLE
# ══════════════════════════════════════════════════════════
c.setFillColor(BG)
c.rect(0, 0, WIDTH, HEIGHT, fill=1)
c.setFillColor(ACCENT)
c.rect(0, HEIGHT - 8*mm, WIDTH, 8*mm, fill=1)
c.setFillColor(PRIMARY)
c.rect(0, HEIGHT - 10*mm, WIDTH, 2*mm, fill=1)
c.setFillColor(TEXT)
c.setFont("Helvetica-Bold", 38)
c.drawCentredString(WIDTH/2, HEIGHT - 78*mm, "OneGemmy")
c.setFont("Helvetica", 18)
c.drawCentredString(WIDTH/2, HEIGHT - 93*mm, "Entity Relationship Diagram & Multi-Tenancy Architecture")
c.setFillColor(MUTED)
c.setFont("Helvetica", 11)
c.drawCentredString(WIDTH/2, HEIGHT - 112*mm, "FastAPI + SQLAlchemy + SQLite  |  Feature-Grouped API v1")
c.drawCentredString(WIDTH/2, HEIGHT - 120*mm, "13 Tables  |  48 Permissions  |  7 Roles  |  5 Demo Users")
c.setFillColor(ACCENT)
c.setFont("Helvetica-Bold", 12)
c.drawCentredString(WIDTH/2, 58*mm, "Gemmy Connect Ltd")
c.setFillColor(MUTED)
c.setFont("Helvetica", 10)
c.drawCentredString(WIDTH/2, 50*mm, "Built with care in Rwanda")
c.setFillColor(PRIMARY)
c.rect(0, 10*mm, WIDTH, 2*mm, fill=1)
c.setFillColor(ACCENT)
c.rect(0, 8*mm, WIDTH, 2*mm, fill=1)
c.showPage()

# ══════════════════════════════════════════════════════════
# PAGE 2 — MULTI-TENANCY OVERVIEW
# ══════════════════════════════════════════════════════════
header_bar("Multi-Tenancy Architecture")
y = HEIGHT - 32*mm

c.setFillColor(TEXT)
c.setFont("Helvetica-Bold", 13)
c.drawString(20*mm, y, "Tenant Hierarchy")
y -= 8*mm

for level, role, desc in [
    ("Platform", "super_admin", "Manages all companies, users. Global access. No company_id filter."),
    ("Company", "company_admin", "Tenant boundary. Owns shops, roles, employees. Scoped to company_id."),
    ("Shop", "user", "Operational unit within company. Owns products, transactions. Scoped to shop_id."),
    ("User", "—", "Belongs to a company + shop + role. Role determines permission set."),
    ("Role", "—", "Per-company or system role. Links to 48 granular permissions via M2M."),
    ("Permission", "—", "Atomic access unit: module.action (e.g. stock.view, sales.create)."),
]:
    c.setFillColor(ACCENT); c.setFont("Helvetica-Bold", 10)
    c.drawString(25*mm, y, level)
    c.setFillColor(PRIMARY); c.setFont("Helvetica", 9)
    c.drawString(52*mm, y, f"[{role}]")
    c.setFillColor(TEXT); c.setFont("Helvetica", 9)
    c.drawString(92*mm, y, desc)
    y -= 7*mm

y -= 6*mm
c.setFillColor(TEXT); c.setFont("Helvetica-Bold", 13)
c.drawString(20*mm, y, "Data Isolation Strategy")
y -= 8*mm

for line in [
    "All business tables (Product, Deal, Lead, Contact, Transaction, Project, Employee) are scoped via company_id.",
    "Users see only their company's data. Super admins bypass all filters.",
    "Roles are per-company (company_id = NULL for system roles).",
    "Shops are per-company. A user can be assigned to one or more shops.",
    "get_current_user() loads user + role + permissions on every request.",
    "require_permission() checks the loaded permissions list. Returns 403 if missing.",
]:
    c.setFillColor(TEXT); c.setFont("Helvetica", 9.5)
    c.drawString(25*mm, y, f"•  {line}")
    y -= 6*mm

y -= 6*mm
c.setFillColor(TEXT); c.setFont("Helvetica-Bold", 13)
c.drawString(20*mm, y, "Request Flow (RBAC)")
y -= 8*mm

for line in [
    "1.  Client sends JWT token in Authorization header.",
    "2.  get_current_user() decodes token → loads User from DB.",
    '3.  require_permission("stock.view") checks: user.role.permissions contains "stock.view"?',
    "4.  If yes → route handler runs. If no → 403 Forbidden.",
    '5.  Super admins bypass all permission checks (platform_role == "super_admin").',
    "6.  Company admins get Owner role permissions (all 48 perms).",
]:
    c.setFillColor(TEXT); c.setFont("Helvetica", 9.5)
    c.drawString(25*mm, y, line)
    y -= 6*mm

y -= 6*mm
c.setFillColor(TEXT); c.setFont("Helvetica-Bold", 13)
c.drawString(20*mm, y, "Seed Data (Demo)")
y -= 8*mm

for line in [
    "Roles:     Owner (48), Admin (40), Manager (30), Sales Rep (10), Inventory Mgr (12), Accountant (14), Employee (8)",
    "Users:     super@onegemmy.com (super_admin), admin@onegemmy.com (Owner), manager@onegemmy.com (Manager),",
    "           sales@onegemmy.com (Sales Rep), staff@onegemmy.com (Employee)",
    "Company:   Gemmy Connect Ltd (slug: gemmy-connect, plan: professional)",
    "Shops:     Kigali Main Store, Nyamirambo Branch, Huye Store",
]:
    c.setFillColor(TEXT); c.setFont("Helvetica", 9.5)
    c.drawString(25*mm, y, line)
    y -= 6*mm

footer()
c.showPage()

# ══════════════════════════════════════════════════════════
# PAGE 3 — AUTH & TENANCY TABLES (6 tables, spacious)
# ══════════════════════════════════════════════════════════
header_bar("ERD — Auth & Tenancy Tables")

TOP = HEIGHT - 25*mm

# ── Row 1: companies, shops, role_permissions ──
t1 = draw_table(15*mm, TOP, "companies", [
    ("id", "INTEGER", "PK"),
    ("name", "VARCHAR(255)", ""),
    ("slug", "VARCHAR(255)", "UNIQUE"),
    ("plan", "VARCHAR(50)", "DEFAULT 'free'"),
    ("is_active", "BOOLEAN", "DEFAULT true"),
    ("created_at", "TIMESTAMP", "SERVER DEFAULT"),
], w=80*mm)

t2 = draw_table(155*mm, TOP, "shops", [
    ("id", "INTEGER", "PK"),
    ("company_id", "INTEGER", "FK → companies.id"),
    ("name", "VARCHAR(255)", ""),
    ("location", "VARCHAR(255)", ""),
    ("status", "VARCHAR(50)", "DEFAULT 'active'"),
    ("created_at", "TIMESTAMP", "SERVER DEFAULT"),
], w=80*mm)

t3 = draw_table(295*mm, TOP, "role_permissions", [
    ("role_id", "INTEGER", "FK → roles.id"),
    ("permission_id", "VARCHAR(100)", "FK → permissions.id"),
], w=80*mm)

# ── Row 2: roles, permissions ──
ROW2_Y = TOP - 62*mm

t4 = draw_table(15*mm, ROW2_Y, "roles", [
    ("id", "INTEGER", "PK"),
    ("company_id", "INTEGER", "FK → companies.id"),
    ("name", "VARCHAR(255)", ""),
    ("description", "TEXT", ""),
    ("color", "VARCHAR(20)", "DEFAULT '#64748B'"),
    ("is_system", "BOOLEAN", "DEFAULT false"),
    ("created_at", "TIMESTAMP", "SERVER DEFAULT"),
], w=80*mm)

t5 = draw_table(155*mm, ROW2_Y, "permissions", [
    ("id", "VARCHAR(100)", "PK"),
    ("name", "VARCHAR(255)", ""),
    ("description", "TEXT", ""),
    ("module", "VARCHAR(100)", ""),
], w=80*mm)

# ── Row 3: users ──
ROW3_Y = ROW2_Y - 72*mm

t6 = draw_table(15*mm, ROW3_Y, "users", [
    ("id", "INTEGER", "PK"),
    ("email", "VARCHAR(255)", "UNIQUE"),
    ("name", "VARCHAR(255)", ""),
    ("hashed_password", "VARCHAR(255)", ""),
    ("platform_role", "VARCHAR(50)", "DEFAULT 'user'"),
    ("role_id", "INTEGER", "FK → roles.id"),
    ("company_id", "INTEGER", "FK → companies.id"),
    ("shop_id", "INTEGER", "FK → shops.id"),
    ("is_active", "BOOLEAN", "DEFAULT true"),
    ("created_at", "TIMESTAMP", "SERVER DEFAULT"),
    ("updated_at", "TIMESTAMP", "ON UPDATE"),
], w=80*mm)

# ── Relationships ──
# companies → shops (1:N)
draw_rel(t1[0]+t1[2], t1[1]-t1[3]/2, t2[0], t2[1]-t2[3]/2, "1 : N")
# companies → roles (1:N)
draw_rel(t1[0]+t1[2]/2, t1[1]-t1[3], t4[0]+t4[2]/2, t4[1], "1 : N")
# roles → role_permissions (1:N)
draw_rel(t4[0]+t4[2], t4[1]-t4[3]/2, t3[0], t3[1]-t3[3]/2, "1 : N")
# permissions → role_permissions (1:N)
draw_rel(t5[0]+t5[2], t5[1]-t5[3]/2, t3[0]+t3[2], t3[1]-t3[3]/2, "1 : N")
# companies → users (1:N)
draw_rel(t1[0]+t1[2], t1[1]-t1[3], t6[0]+t6[2]/2, t6[1], "1 : N")
# shops → users (1:N)
draw_rel(t2[0]+t2[2]/2, t2[1]-t2[3], t6[0]+t6[2], t6[1]-t6[3]/2, "1 : N")
# roles → users (1:N)
draw_rel(t4[0]+t4[2], t4[1]-t4[3], t6[0]+t6[2]/4, t6[1], "1 : N")

# Legend
ly = 18*mm
c.setFillColor(TEXT); c.setFont("Helvetica-Bold", 8)
c.drawString(15*mm, ly, "Legend:")
c.setFillColor(PK_COLOR); c.setFont("Helvetica", 7)
c.drawString(35*mm, ly, "■ PK  ")
c.setFillColor(FK_COLOR)
c.drawString(55*mm, ly, "■ FK  ")
c.setFillColor(PRIMARY)
c.drawString(75*mm, ly, "● Crow's Foot (Many)  ")
c.setFillColor(MUTED)
c.drawString(110*mm, ly, "- - - Relationship  ")
c.setFillColor(TEXT)
c.drawString(145*mm, ly, "Page 3 of 5  |  Auth & Tenancy Tables")

footer()
c.showPage()

# ══════════════════════════════════════════════════════════
# PAGE 4 — BUSINESS TABLES (7 tables)
# ══════════════════════════════════════════════════════════
header_bar("ERD — Business Tables")

TOP = HEIGHT - 25*mm

# ── Row 1: products, leads, contacts ──
b1 = draw_table(15*mm, TOP, "products", [
    ("id", "INTEGER", "PK"),
    ("sku", "VARCHAR(100)", "UNIQUE"),
    ("name", "VARCHAR(255)", ""),
    ("description", "TEXT", ""),
    ("category", "VARCHAR(100)", ""),
    ("price", "FLOAT", ""),
    ("cost", "FLOAT", "DEFAULT 0"),
    ("stock_quantity", "INTEGER", "DEFAULT 0"),
    ("min_stock", "INTEGER", "DEFAULT 0"),
    ("is_active", "BOOLEAN", "DEFAULT true"),
    ("created_at", "TIMESTAMP", "SERVER DEFAULT"),
    ("updated_at", "TIMESTAMP", "ON UPDATE"),
], w=80*mm)

b2 = draw_table(155*mm, TOP, "leads", [
    ("id", "INTEGER", "PK"),
    ("name", "VARCHAR(255)", ""),
    ("email", "VARCHAR(255)", ""),
    ("phone", "VARCHAR(50)", ""),
    ("company", "VARCHAR(255)", ""),
    ("source", "VARCHAR(100)", ""),
    ("notes", "TEXT", ""),
    ("is_converted", "BOOLEAN", "DEFAULT false"),
    ("created_at", "TIMESTAMP", "SERVER DEFAULT"),
    ("updated_at", "TIMESTAMP", "ON UPDATE"),
], w=80*mm)

b3 = draw_table(295*mm, TOP, "contacts", [
    ("id", "INTEGER", "PK"),
    ("name", "VARCHAR(255)", ""),
    ("email", "VARCHAR(255)", ""),
    ("phone", "VARCHAR(50)", ""),
    ("company", "VARCHAR(255)", ""),
    ("status", "VARCHAR(50)", "DEFAULT 'active'"),
    ("notes", "TEXT", ""),
    ("created_at", "TIMESTAMP", "SERVER DEFAULT"),
    ("updated_at", "TIMESTAMP", "ON UPDATE"),
], w=80*mm)

# ── Row 2: deals, transactions ──
ROW2_Y = TOP - 88*mm

b4 = draw_table(15*mm, ROW2_Y, "deals", [
    ("id", "INTEGER", "PK"),
    ("title", "VARCHAR(255)", ""),
    ("value", "FLOAT", ""),
    ("stage", "VARCHAR(50)", "DEFAULT 'lead'"),
    ("probability", "INTEGER", "DEFAULT 0"),
    ("lead_id", "INTEGER", "FK → leads.id"),
    ("owner_id", "INTEGER", "FK → users.id"),
    ("notes", "TEXT", ""),
    ("closed_at", "TIMESTAMP", ""),
    ("created_at", "TIMESTAMP", "SERVER DEFAULT"),
    ("updated_at", "TIMESTAMP", "ON UPDATE"),
], w=80*mm)

b5 = draw_table(155*mm, ROW2_Y, "transactions", [
    ("id", "INTEGER", "PK"),
    ("description", "VARCHAR(255)", ""),
    ("amount", "FLOAT", ""),
    ("type", "VARCHAR(50)", ""),
    ("category", "VARCHAR(100)", ""),
    ("reference", "VARCHAR(100)", ""),
    ("created_at", "TIMESTAMP", "SERVER DEFAULT"),
], w=80*mm)

# ── Row 3: projects, employees ──
ROW3_Y = ROW2_Y - 82*mm

b6 = draw_table(15*mm, ROW3_Y, "projects", [
    ("id", "INTEGER", "PK"),
    ("name", "VARCHAR(255)", ""),
    ("description", "TEXT", ""),
    ("client", "VARCHAR(255)", ""),
    ("status", "VARCHAR(50)", "DEFAULT 'planning'"),
    ("progress", "INTEGER", "DEFAULT 0"),
    ("budget", "FLOAT", "DEFAULT 0"),
    ("deadline", "TIMESTAMP", ""),
    ("owner_id", "INTEGER", "FK → users.id"),
    ("created_at", "TIMESTAMP", "SERVER DEFAULT"),
    ("updated_at", "TIMESTAMP", "ON UPDATE"),
], w=80*mm)

b7 = draw_table(155*mm, ROW3_Y, "employees", [
    ("id", "INTEGER", "PK"),
    ("user_id", "INTEGER", "FK → users.id"),
    ("name", "VARCHAR(255)", ""),
    ("email", "VARCHAR(255)", ""),
    ("role", "VARCHAR(100)", ""),
    ("department", "VARCHAR(100)", ""),
    ("status", "VARCHAR(50)", "DEFAULT 'active'"),
    ("phone", "VARCHAR(50)", ""),
    ("hire_date", "TIMESTAMP", ""),
    ("created_at", "TIMESTAMP", "SERVER DEFAULT"),
    ("updated_at", "TIMESTAMP", "ON UPDATE"),
], w=80*mm)

# Relationships (note: users is on page 3, we show FK labels only)
# leads → deals (1:N)
draw_rel(b2[0]+b2[2]/2, b2[1]-b2[3], b4[0]+b4[2]/4, b4[1], "1 : N")

# Legend
ly = 18*mm
c.setFillColor(TEXT); c.setFont("Helvetica-Bold", 8)
c.drawString(15*mm, ly, "Legend:")
c.setFillColor(PK_COLOR); c.setFont("Helvetica", 7)
c.drawString(35*mm, ly, "■ PK  ")
c.setFillColor(FK_COLOR)
c.drawString(55*mm, ly, "■ FK  ")
c.setFillColor(PRIMARY)
c.drawString(75*mm, ly, "● Crow's Foot (Many)  ")
c.setFillColor(MUTED)
c.drawString(110*mm, ly, "- - - Relationship  ")
c.setFillColor(TEXT)
c.drawString(145*mm, ly, "Page 4 of 5  |  Business Tables  |  FK to users.id shown on Page 3")

footer()
c.showPage()

# ══════════════════════════════════════════════════════════
# PAGE 5 — PERMISSION MATRIX
# ══════════════════════════════════════════════════════════
header_bar("RBAC Permission Matrix")

y = HEIGHT - 28*mm
c.setFillColor(TEXT); c.setFont("Helvetica-Bold", 13)
c.drawString(20*mm, y, "Roles & Permissions")
y -= 10*mm

# Table header
c.setFillColor(HEADER_BG)
c.rect(20*mm, y - 9*mm, WIDTH - 40*mm, 9*mm, fill=1)
c.setFillColor(HEADER_FG)
c.setFont("Helvetica-Bold", 9)
for label, hx in [("Role", 25*mm), ("Perms", 60*mm), ("Modules", 80*mm), ("Description", 140*mm)]:
    c.drawString(hx, y - 6.5*mm, label)
y -= 9*mm

for i, (role, perms, modules, desc) in enumerate([
    ("Owner", 48, "All", "Full access to everything. Company creator."),
    ("Admin", 40, "All except user mgmt", "Manages everything except inviting users."),
    ("Manager", 30, "Sales, Stock, Finance, Projects", "Day-to-day operations across modules."),
    ("Sales Rep", 10, "CRM, Sales (view/create/edit)", "Manages leads, deals, contacts."),
    ("Inventory Mgr", 12, "Stock (full), Products", "Manages products, stock levels."),
    ("Accountant", 14, "Finance (full), Reports", "Manages transactions, invoices, reports."),
    ("Employee", 8, "Projects (view), Contacts (view)", "Limited read access. No sensitive data."),
]):
    ry = y - 9*mm
    if i % 2 == 0:
        c.setFillColor(TABLE_BG)
        c.rect(20*mm, ry, WIDTH - 40*mm, 9*mm, fill=1, stroke=0)
    c.setFillColor(TEXT); c.setFont("Helvetica-Bold", 9)
    c.drawString(25*mm, ry + 2.5*mm, role)
    c.setFillColor(PRIMARY); c.setFont("Helvetica", 9)
    c.drawString(60*mm, ry + 2.5*mm, str(perms))
    c.setFillColor(TEXT); c.setFont("Helvetica", 8)
    c.drawString(80*mm, ry + 2.5*mm, modules)
    c.setFillColor(MUTED); c.setFont("Helvetica", 7.5)
    c.drawString(140*mm, ry + 2.5*mm, desc)
    y -= 9*mm

y -= 14*mm
c.setFillColor(TEXT); c.setFont("Helvetica-Bold", 13)
c.drawString(20*mm, y, "Permission Modules (48 total)")
y -= 10*mm

for mod, perms in [
    ("dashboard", ["view"]),
    ("sales", ["view", "create", "edit", "delete", "leads.manage", "quotes.manage"]),
    ("stock", ["view", "create", "edit", "delete"]),
    ("finance", ["view", "create", "edit", "delete"]),
    ("projects", ["view", "create", "edit", "delete"]),
    ("crm", ["view", "contacts.manage", "interactions.log"]),
    ("hr", ["view", "employees.manage"]),
    ("reports", ["view"]),
    ("settings", ["view", "users.manage", "roles.manage"]),
]:
    c.setFillColor(ACCENT); c.setFont("Helvetica-Bold", 9.5)
    c.drawString(25*mm, y, mod)
    c.setFillColor(TEXT); c.setFont("Helvetica", 8.5)
    c.drawString(58*mm, y, ", ".join(perms))
    y -= 7*mm

footer()
c.showPage()

c.save()
print(f"ERD PDF saved to: {OUTPUT}")
