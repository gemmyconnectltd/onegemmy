from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm, cm
from reportlab.pdfgen import canvas
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import Paragraph
import os

WIDTH, HEIGHT = landscape(A4)
OUTPUT = os.path.join(os.path.dirname(__file__), "..", "docs", "onegemmy_erd_multitenancy.pdf")
os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)

# ── Colors ──
BG = colors.HexColor("#ffffff")
ACCENT = colors.HexColor("#6f1a07")
PRIMARY = colors.HexColor("#af9164")
TEXT = colors.HexColor("#2b2118")
MUTED = colors.HexColor("#b3b6b7")
BORDER = colors.HexColor("#e8e4de")
TABLE_BG = colors.HexColor("#f8f8f6")
HEADER_BG = colors.HexColor("#6f1a07")
HEADER_FG = colors.white
FK_COLOR = colors.HexColor("#6f1a07")
PK_COLOR = colors.HexColor("#af9164")

c = canvas.Canvas(OUTPUT, pagesize=landscape(A4))
c.setTitle("OneGemmy - ERD & Multi-Tenancy Architecture")
c.setAuthor("Gemmy Connect Ltd")

# ══════════════════════════════════════════════════════════
# PAGE 1 — TITLE
# ══════════════════════════════════════════════════════════
c.setFillColor(BG)
c.rect(0, 0, WIDTH, HEIGHT, fill=1)

# accent bar
c.setFillColor(ACCENT)
c.rect(0, HEIGHT - 8*mm, WIDTH, 8*mm, fill=1)
c.setFillColor(PRIMARY)
c.rect(0, HEIGHT - 10*mm, WIDTH, 2*mm, fill=1)

c.setFillColor(TEXT)
c.setFont("Helvetica-Bold", 36)
c.drawCentredString(WIDTH/2, HEIGHT - 80*mm, "OneGemmy")
c.setFont("Helvetica", 18)
c.drawCentredString(WIDTH/2, HEIGHT - 95*mm, "Entity Relationship Diagram & Multi-Tenancy Architecture")

c.setFillColor(MUTED)
c.setFont("Helvetica", 11)
c.drawCentredString(WIDTH/2, HEIGHT - 115*mm, "FastAPI + SQLAlchemy + SQLite  |  Feature-Grouped API v1")
c.drawCentredString(WIDTH/2, HEIGHT - 122*mm, "48 Permissions  |  7 Roles  |  5 Demo Users")

c.setFillColor(ACCENT)
c.setFont("Helvetica-Bold", 12)
c.drawCentredString(WIDTH/2, 60*mm, "Gemmy Connect Ltd")
c.setFillColor(MUTED)
c.setFont("Helvetica", 10)
c.drawCentredString(WIDTH/2, 52*mm, "Built with care in Rwanda")

# accent bar bottom
c.setFillColor(PRIMARY)
c.rect(0, 10*mm, WIDTH, 2*mm, fill=1)
c.setFillColor(ACCENT)
c.rect(0, 8*mm, WIDTH, 2*mm, fill=1)

c.showPage()

# ══════════════════════════════════════════════════════════
# PAGE 2 — MULTI-TENANCY OVERVIEW
# ══════════════════════════════════════════════════════════
c.setFillColor(BG)
c.rect(0, 0, WIDTH, HEIGHT, fill=1)

# Header bar
c.setFillColor(ACCENT)
c.rect(0, HEIGHT - 12*mm, WIDTH, 12*mm, fill=1)
c.setFillColor(HEADER_FG)
c.setFont("Helvetica-Bold", 14)
c.drawString(20*mm, HEIGHT - 9*mm, "Multi-Tenancy Architecture")

y = HEIGHT - 35*mm

# ── Section: Hierarchy ──
c.setFillColor(TEXT)
c.setFont("Helvetica-Bold", 14)
c.drawString(20*mm, y, "Tenant Hierarchy")
y -= 8*mm

hierarchy = [
    ("Platform", "super_admin", "Manages all companies, users. Global access. No company_id filter."),
    ("Company", "company_admin", "Tenant boundary. Owns shops, roles, employees. Scoped to company_id."),
    ("Shop", "user", "Operational unit within company. Owns products, transactions. Scoped to shop_id."),
    ("User", "—", "Belongs to a company + shop + role. Role determines permission set."),
    ("Role", "—", "Per-company or system role. Links to 48 granular permissions via M2M."),
    ("Permission", "—", "Atomic access unit: module.action (e.g. stock.view, sales.create)."),
]

for level, role, desc in hierarchy:
    c.setFillColor(ACCENT)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(25*mm, y, level)
    c.setFillColor(PRIMARY)
    c.setFont("Helvetica", 9)
    c.drawString(55*mm, y, f"[{role}]")
    c.setFillColor(TEXT)
    c.setFont("Helvetica", 9)
    c.drawString(95*mm, y, desc)
    y -= 7*mm

y -= 6*mm

# ── Section: Data Isolation ──
c.setFillColor(TEXT)
c.setFont("Helvetica-Bold", 14)
c.drawString(20*mm, y, "Data Isolation Strategy")
y -= 8*mm

isolation = [
    "All business tables (Product, Deal, Lead, Contact, Transaction, Project, Employee) are scoped via company_id.",
    "Users see only their company's data. Super admins bypass all filters.",
    "Roles are per-company (company_id = NULL for system roles).",
    "Shops are per-company. A user can be assigned to one or more shops.",
    "The get_current_user() dependency loads user + role + permissions on every request.",
    "The require_permission() dependency checks the loaded permissions list. Returns 403 if missing.",
]

for line in isolation:
    c.setFillColor(TEXT)
    c.setFont("Helvetica", 9.5)
    c.drawString(25*mm, y, f"•  {line}")
    y -= 6*mm

y -= 8*mm

# ── Section: RBAC Flow ──
c.setFillColor(TEXT)
c.setFont("Helvetica-Bold", 14)
c.drawString(20*mm, y, "Request Flow (RBAC)")
y -= 8*mm

flow = [
    "1.  Client sends JWT token in Authorization header.",
    "2.  get_current_user() decodes token → loads User from DB.",
    "3.  require_permission(\"stock.view\") checks: user.role.permissions contains \"stock.view\"?",
    "4.  If yes → route handler runs. If no → 403 Forbidden.",
    "5.  Super admins bypass all permission checks (platform_role == \"super_admin\").",
    "6.  Company admins get Owner role permissions (all 48 perms).",
]

for line in flow:
    c.setFillColor(TEXT)
    c.setFont("Helvetica", 9.5)
    c.drawString(25*mm, y, line)
    y -= 6*mm

y -= 8*mm

# ── Section: Seed Data ──
c.setFillColor(TEXT)
c.setFont("Helvetica-Bold", 14)
c.drawString(20*mm, y, "Seed Data (Demo)")
y -= 8*mm

seeds = [
    "Roles:     Owner (48), Admin (40), Manager (30), Sales Rep (10), Inventory Mgr (12), Accountant (14), Employee (8)",
    "Users:     super@onegemmy.com (super_admin), admin@onegemmy.com (Owner), manager@onegemmy.com (Manager),",
    "           sales@onegemmy.com (Sales Rep), staff@onegemmy.com (Employee)",
    "Company:   Gemmy Connect Ltd (slug: gemmy-connect, plan: professional)",
    "Shops:     Kigali Main Store, Nyamirambo Branch, Huye Store",
]

for line in seeds:
    c.setFillColor(TEXT)
    c.setFont("Helvetica", 9.5)
    c.drawString(25*mm, y, line)
    y -= 6*mm

c.showPage()

# ══════════════════════════════════════════════════════════
# PAGE 3 — FULL ERD DIAGRAM
# ══════════════════════════════════════════════════════════
c.setFillColor(BG)
c.rect(0, 0, WIDTH, HEIGHT, fill=1)

# Header
c.setFillColor(ACCENT)
c.rect(0, HEIGHT - 12*mm, WIDTH, 12*mm, fill=1)
c.setFillColor(HEADER_FG)
c.setFont("Helvetica-Bold", 14)
c.drawString(20*mm, HEIGHT - 9*mm, "Entity Relationship Diagram")

# ── Table definitions ──
tables = {
    "companies": {
        "pos": (20*mm, HEIGHT - 55*mm),
        "cols": [
            ("id", "INTEGER", "PK"),
            ("name", "VARCHAR(255)", ""),
            ("slug", "VARCHAR(255)", "UNIQUE"),
            ("plan", "VARCHAR(50)", "DEFAULT 'free'"),
            ("is_active", "BOOLEAN", "DEFAULT true"),
            ("created_at", "TIMESTAMP", "SERVER DEFAULT"),
        ],
    },
    "shops": {
        "pos": (120*mm, HEIGHT - 55*mm),
        "cols": [
            ("id", "INTEGER", "PK"),
            ("company_id", "INTEGER", "FK → companies.id"),
            ("name", "VARCHAR(255)", ""),
            ("location", "VARCHAR(255)", ""),
            ("status", "VARCHAR(50)", "DEFAULT 'active'"),
            ("created_at", "TIMESTAMP", "SERVER DEFAULT"),
        ],
    },
    "roles": {
        "pos": (20*mm, HEIGHT - 140*mm),
        "cols": [
            ("id", "INTEGER", "PK"),
            ("company_id", "INTEGER", "FK → companies.id"),
            ("name", "VARCHAR(255)", ""),
            ("description", "TEXT", ""),
            ("color", "VARCHAR(20)", "DEFAULT '#64748B'"),
            ("is_system", "BOOLEAN", "DEFAULT false"),
            ("created_at", "TIMESTAMP", "SERVER DEFAULT"),
        ],
    },
    "permissions": {
        "pos": (220*mm, HEIGHT - 140*mm),
        "cols": [
            ("id", "VARCHAR(100)", "PK"),
            ("name", "VARCHAR(255)", ""),
            ("description", "TEXT", ""),
            ("module", "VARCHAR(100)", ""),
        ],
    },
    "role_permissions": {
        "pos": (220*mm, HEIGHT - 80*mm),
        "cols": [
            ("role_id", "INTEGER", "FK → roles.id"),
            ("permission_id", "VARCHAR(100)", "FK → permissions.id"),
        ],
    },
    "users": {
        "pos": (120*mm, HEIGHT - 185*mm),
        "cols": [
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
        ],
    },
    "products": {
        "pos": (240*mm, HEIGHT - 210*mm),
        "cols": [
            ("id", "INTEGER", "PK"),
            ("sku", "VARCHAR(100)", "UNIQUE"),
            ("name", "VARCHAR(255)", ""),
            ("category", "VARCHAR(100)", ""),
            ("price", "FLOAT", ""),
            ("cost", "FLOAT", "DEFAULT 0"),
            ("stock_quantity", "INTEGER", "DEFAULT 0"),
            ("min_stock", "INTEGER", "DEFAULT 0"),
            ("is_active", "BOOLEAN", "DEFAULT true"),
            ("created_at", "TIMESTAMP", "SERVER DEFAULT"),
        ],
    },
    "leads": {
        "pos": (20*mm, HEIGHT - 225*mm),
        "cols": [
            ("id", "INTEGER", "PK"),
            ("name", "VARCHAR(255)", ""),
            ("email", "VARCHAR(255)", ""),
            ("phone", "VARCHAR(50)", ""),
            ("company", "VARCHAR(255)", ""),
            ("source", "VARCHAR(100)", ""),
            ("is_converted", "BOOLEAN", "DEFAULT false"),
            ("created_at", "TIMESTAMP", "SERVER DEFAULT"),
        ],
    },
    "deals": {
        "pos": (130*mm, HEIGHT - 270*mm),
        "cols": [
            ("id", "INTEGER", "PK"),
            ("title", "VARCHAR(255)", ""),
            ("value", "FLOAT", ""),
            ("stage", "VARCHAR(50)", "DEFAULT 'lead'"),
            ("probability", "INTEGER", "DEFAULT 0"),
            ("lead_id", "INTEGER", "FK → leads.id"),
            ("owner_id", "INTEGER", "FK → users.id"),
            ("closed_at", "TIMESTAMP", ""),
            ("created_at", "TIMESTAMP", "SERVER DEFAULT"),
        ],
    },
    "contacts": {
        "pos": (20*mm, HEIGHT - 310*mm),
        "cols": [
            ("id", "INTEGER", "PK"),
            ("name", "VARCHAR(255)", ""),
            ("email", "VARCHAR(255)", ""),
            ("phone", "VARCHAR(50)", ""),
            ("company", "VARCHAR(255)", ""),
            ("status", "VARCHAR(50)", "DEFAULT 'active'"),
            ("created_at", "TIMESTAMP", "SERVER DEFAULT"),
        ],
    },
    "transactions": {
        "pos": (240*mm, HEIGHT - 310*mm),
        "cols": [
            ("id", "INTEGER", "PK"),
            ("description", "VARCHAR(255)", ""),
            ("amount", "FLOAT", ""),
            ("type", "VARCHAR(50)", ""),
            ("category", "VARCHAR(100)", ""),
            ("reference", "VARCHAR(100)", ""),
            ("created_at", "TIMESTAMP", "SERVER DEFAULT"),
        ],
    },
    "projects": {
        "pos": (130*mm, HEIGHT - 345*mm),
        "cols": [
            ("id", "INTEGER", "PK"),
            ("name", "VARCHAR(255)", ""),
            ("client", "VARCHAR(255)", ""),
            ("status", "VARCHAR(50)", "DEFAULT 'planning'"),
            ("progress", "INTEGER", "DEFAULT 0"),
            ("budget", "FLOAT", "DEFAULT 0"),
            ("deadline", "TIMESTAMP", ""),
            ("owner_id", "INTEGER", "FK → users.id"),
            ("created_at", "TIMESTAMP", "SERVER DEFAULT"),
        ],
    },
    "employees": {
        "pos": (240*mm, HEIGHT - 385*mm),
        "cols": [
            ("id", "INTEGER", "PK"),
            ("user_id", "INTEGER", "FK → users.id"),
            ("name", "VARCHAR(255)", ""),
            ("email", "VARCHAR(255)", ""),
            ("role", "VARCHAR(100)", ""),
            ("department", "VARCHAR(100)", ""),
            ("status", "VARCHAR(50)", "DEFAULT 'active'"),
            ("hire_date", "TIMESTAMP", ""),
            ("created_at", "TIMESTAMP", "SERVER DEFAULT"),
        ],
    },
}

def draw_table(c, name, data):
    x, y = data["pos"]
    cols = data["cols"]
    row_h = 5.5*mm
    header_h = 7*mm
    w = 70*mm
    total_h = header_h + len(cols) * row_h

    # shadow
    c.setFillColor(colors.HexColor("#00000008"))
    c.rect(x + 1*mm, y - total_h + 1*mm, w, total_h, fill=1, stroke=0)

    # table body
    c.setFillColor(TABLE_BG)
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.5)
    c.rect(x, y - total_h, w, total_h, fill=1, stroke=1)

    # header
    c.setFillColor(HEADER_BG)
    c.rect(x, y - header_h, w, header_h, fill=1, stroke=0)
    c.setFillColor(HEADER_FG)
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(x + w/2, y - header_h + 2*mm, name)

    # rows
    ry = y - header_h
    for i, (col_name, col_type, col_note) in enumerate(cols):
        ry -= row_h

        # alternating row bg
        if i % 2 == 0:
            c.setFillColor(colors.HexColor("#fafaf8"))
            c.rect(x + 0.3*mm, ry, w - 0.6*mm, row_h, fill=1, stroke=0)

        # column name
        is_pk = "PK" in col_note
        is_fk = "FK" in col_note

        if is_pk:
            c.setFillColor(PK_COLOR)
            c.setFont("Helvetica-Bold", 7)
        elif is_fk:
            c.setFillColor(FK_COLOR)
            c.setFont("Helvetica-Bold", 7)
        else:
            c.setFillColor(TEXT)
            c.setFont("Helvetica", 7)

        c.drawString(x + 3*mm, ry + 1.5*mm, col_name)

        # type
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 6.5)
        c.drawString(x + 32*mm, ry + 1.5*mm, col_type)

        # note
        if col_note:
            if is_fk:
                c.setFillColor(FK_COLOR)
            elif is_pk:
                c.setFillColor(PK_COLOR)
            else:
                c.setFillColor(MUTED)
            c.setFont("Helvetica", 6)
            c.drawRightString(x + w - 2*mm, ry + 1.5*mm, col_note)

    return x, y, w, total_h

table_positions = {}
for name, data in tables.items():
    x, y, w, h = draw_table(c, name, data)
    table_positions[name] = (x, y, w, h)

# ── Relationships (arrows) ──
def draw_rel(c, from_table, from_side, to_table, to_side, label=""):
    fx, fy, fw, fh = table_positions[from_table]
    tx, ty, tw, th = table_positions[to_table]

    # from point
    if from_side == "right":
        fpx, fpy = fx + fw, fy - fh/2
    elif from_side == "left":
        fpx, fpy = fx, fy - fh/2
    elif from_side == "bottom":
        fpx, fpy = fx + fw/2, fy - fh
    elif from_side == "top":
        fpx, fpy = fx + fw/2, fy

    # to point
    if to_side == "left":
        tpx, tpy = tx, ty - th/2
    elif to_side == "right":
        tpx, tpy = tx + tw, ty - th/2
    elif to_side == "top":
        tpx, tpy = tx + tw/2, ty
    elif to_side == "bottom":
        tpx, tpy = tx + tw/2, ty - th

    c.setStrokeColor(PRIMARY)
    c.setLineWidth(0.8)
    c.setDash(3, 2)
    c.line(fpx, fpy, tpx, tpy)
    c.setDash()

    # crow's foot (small circle at "many" end)
    c.setFillColor(PRIMARY)
    c.circle(tpx, tpy, 1.2*mm, fill=1, stroke=0)

    if label:
        mx, my = (fpx + tpx)/2, (fpy + tpy)/2
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 5.5)
        c.drawCentredString(mx, my + 2*mm, label)

# Draw relationships
rels = [
    ("companies", "right", "shops", "left", "1:N"),
    ("companies", "bottom", "roles", "top", "1:N"),
    ("companies", "bottom", "users", "top", "1:N"),
    ("shops", "bottom", "users", "right", "1:N"),
    ("roles", "right", "role_permissions", "left", "M:N"),
    ("permissions", "bottom", "role_permissions", "top", "M:N"),
    ("users", "bottom", "deals", "top", "1:N"),
    ("leads", "right", "deals", "left", "1:N"),
    ("users", "bottom", "projects", "top", "1:N"),
    ("users", "bottom", "employees", "top", "1:N"),
]

for args in rels:
    draw_rel(c, *args)

# ── Legend ──
lx = 15*mm
ly = 25*mm
c.setFillColor(TEXT)
c.setFont("Helvetica-Bold", 9)
c.drawString(lx, ly, "Legend:")
c.setFont("Helvetica", 7)

c.setFillColor(PK_COLOR)
c.drawString(lx + 30*mm, ly, "■ Primary Key")
c.setFillColor(FK_COLOR)
c.drawString(lx + 55*mm, ly, "■ Foreign Key")
c.setFillColor(PRIMARY)
c.drawString(lx + 80*mm, ly, "● Crow's Foot (Many)")
c.setFillColor(MUTED)
c.drawString(lx + 105*mm, ly, "- - - Relationship")

c.showPage()

# ══════════════════════════════════════════════════════════
# PAGE 4 — PERMISSION MATRIX
# ══════════════════════════════════════════════════════════
c.setFillColor(BG)
c.rect(0, 0, WIDTH, HEIGHT, fill=1)

c.setFillColor(ACCENT)
c.rect(0, HEIGHT - 12*mm, WIDTH, 12*mm, fill=1)
c.setFillColor(HEADER_FG)
c.setFont("Helvetica-Bold", 14)
c.drawString(20*mm, HEIGHT - 9*mm, "RBAC Permission Matrix")

y = HEIGHT - 30*mm

roles_perms = {
    "Owner":       {"perms": 48, "modules": "All", "desc": "Full access to everything. Company creator."},
    "Admin":       {"perms": 40, "modules": "All except user mgmt", "desc": "Manages everything except inviting users."},
    "Manager":     {"perms": 30, "modules": "Sales, Stock, Finance, Projects", "desc": "Day-to-day operations across modules."},
    "Sales Rep":   {"perms": 10, "modules": "CRM, Sales (view/create/edit)", "desc": "Manages leads, deals, contacts."},
    "Inventory Mgr":{"perms": 12, "modules": "Stock (full), Products", "desc": "Manages products, stock levels."},
    "Accountant":  {"perms": 14, "modules": "Finance (full), Reports", "desc": "Manages transactions, invoices, reports."},
    "Employee":    {"perms": 8,  "modules": "Projects (view), Contacts (view)", "desc": "Limited read access. No sensitive data."},
}

# Table header
c.setFillColor(HEADER_BG)
c.rect(20*mm, y - 8*mm, WIDTH - 40*mm, 8*mm, fill=1)
c.setFillColor(HEADER_FG)
c.setFont("Helvetica-Bold", 8)
headers = [("Role", 25*mm), ("Perms", 55*mm), ("Modules", 75*mm), ("Description", 135*mm)]
for label, hx in headers:
    c.drawString(hx, y - 6*mm, label)

y -= 8*mm

# Rows
for i, (role, info) in enumerate(roles_perms.items()):
    row_y = y - 8*mm
    row_h = 8*mm

    if i % 2 == 0:
        c.setFillColor(TABLE_BG)
        c.rect(20*mm, row_y, WIDTH - 40*mm, row_h, fill=1, stroke=0)

    c.setFillColor(TEXT)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(25*mm, row_y + 2*mm, role)

    c.setFillColor(PRIMARY)
    c.setFont("Helvetica", 8)
    c.drawString(55*mm, row_y + 2*mm, str(info["perms"]))

    c.setFillColor(TEXT)
    c.setFont("Helvetica", 7.5)
    c.drawString(75*mm, row_y + 2*mm, info["modules"])

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7)
    c.drawString(135*mm, row_y + 2*mm, info["desc"])

    y -= row_h

# ── Permission Modules ──
y -= 12*mm
c.setFillColor(TEXT)
c.setFont("Helvetica-Bold", 12)
c.drawString(20*mm, y, "Permission Modules (48 total)")
y -= 8*mm

modules = {
    "dashboard": ["view"],
    "sales": ["view", "create", "edit", "delete", "leads.manage", "quotes.manage"],
    "stock": ["view", "create", "edit", "delete"],
    "finance": ["view", "create", "edit", "delete"],
    "projects": ["view", "create", "edit", "delete"],
    "crm": ["view", "contacts.manage", "interactions.log"],
    "hr": ["view", "employees.manage"],
    "reports": ["view"],
    "settings": ["view", "users.manage", "roles.manage"],
}

for mod, perms in modules.items():
    c.setFillColor(ACCENT)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(25*mm, y, mod)

    perm_str = ", ".join(perms)
    c.setFillColor(TEXT)
    c.setFont("Helvetica", 8)
    c.drawString(55*mm, y, perm_str)
    y -= 6*mm

# Footer
c.setFillColor(PRIMARY)
c.rect(0, 8*mm, WIDTH, 2*mm, fill=1)

c.save()
print(f"ERD PDF saved to: {OUTPUT}")
