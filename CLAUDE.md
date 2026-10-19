# OneGemmy project instructions

Read AGENTS.md for engineering rules.

## Pesaa Frontend Design System — Mandatory

Before creating or modifying UI in website/, frontend/ or super-admin/:
1. Read `docs/DESIGN_SYSTEM.md` from the repository root and inspect existing shared components.
2. Use approved tokens, Geist typography, spacing, buttons, tables, forms, navigation and layout patterns.
3. Reuse existing Button, table boundary/DataTable, Input, Select, domain Badge, Drawer/ConfirmDialog and layout components; do not create competing implementations.
4. Use the configured primary green (#16A34A) default, with existing tenant theme overrides. Preserve semantic colors and company branding.
5. Do not introduce competing action colors, new fonts, arbitrary typography or silent token changes.
6. Preserve business logic, APIs, routes, module order, tenant isolation, permissions and validation.
7. Run design-system checks/tests, relevant lint/type checks and production builds; verify responsive behavior and accessibility.

All Pesaa frontend changes must comply with the official design system. If a feature conflicts, explain the conflict and follow existing standards unless the user explicitly requests a global design change. For an authorized global change, update the central design system, documentation and tests before applying it across the application. Do not claim unreviewed pages are standardized.

Sidebar standard: white/light neutral background; one full-width solid green route-active row per sidebar, with white text/icons/indicator, square corners and no decorative border, gradient or shadow. Expanded parents yield the solid fill to the active child. Reuse `pesaa-nav-row` / `data-active`, preserve keyboard focus, and retain tenant color overrides.
