# ERP navigation

The primary sidebar and the module navigation use `src/lib/navigation.ts` as their shared link configuration. Keep new module links there so both surfaces remain consistent.

Dashboard comes first. Daily operations contains Sales, Services, Inventory, Purchases and Customers. Financial management contains the independent Debt Management, Expense Management and Accounting modules. Business management contains Manufacturing, Branch Management, HR and Reports. System contains Settings and Help & Support.

Module buttons expand without navigating. The active route expands its module on navigation or refresh. Collapsed module icons reopen the sidebar with the chosen submenu. Existing feature and permission gates remain in place. Logo and account controls remain fixed while the links scroll.

On smaller screens, the header menu and bottom More button open the same drawer, with focus containment, Escape dismissal and closing after navigation. The support control sits above the bottom navigation.

Verification: navigation unit tests cover grouping, gates, shared links and active matching. Browser checks cover desktop, short-height scrolling, collapsed access, refresh, tablet/mobile navigation, keyboard focus and horizontal overflow.
