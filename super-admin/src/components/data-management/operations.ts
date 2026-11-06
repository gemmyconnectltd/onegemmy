import { Archive, CalendarCheck, CalendarX2, ClipboardEdit, Download, Eraser, FlaskConical, Trash2, Upload, type LucideIcon } from "lucide-react";

export interface DmOperationCard {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** The platform permission needed to start it. */
  permission: string;
  steps: string[];
  /** Where it goes once a business is chosen. Null: Super Admin does not offer it, and the page says why. */
  target: ((tenantId: string) => string) | null;
  unavailable?: { why: string; instead: string };
}

export const OPERATION_CARDS: DmOperationCard[] = [
  { key: "clean-test", title: "Clean Test Data", description: "Find and safely remove eligible test/demo records.", icon: FlaskConical, permission: "data:preview",
    steps: ["Select business", "Select module", "Review records", "Dependency check", "Approval", "Execute", "Results"], target: (t) => `/data-management?tenant=${t}&op=clean_test` },
  { key: "reset-day", title: "Reset Business Day", description: "Review and safely correct, archive, or close a selected business day.", icon: CalendarX2, permission: "data:preview",
    steps: ["Select business", "Select date", "View day activity", "Choose strategy", "Preview impact", "Approval", "Execute"], target: (t) => `/data-management/day?tenant=${t}` },
  { key: "correct", title: "Correct / Adjust Records", description: "Fix eligible business records.", icon: ClipboardEdit, permission: "data:preview",
    steps: ["Select business", "Select module", "Search record", "Propose correction", "Validate", "Approve", "Apply"], target: (t) => `/data-management?tenant=${t}&op=correct` },
  { key: "archive", title: "Archive Records", description: "Deactivate eligible records without losing required history.", icon: Archive, permission: "data:preview",
    steps: ["Select business", "Select module", "Filter records", "Preview", "Confirm", "Archive", "Results"], target: (t) => `/data-management?tenant=${t}&op=archive` },
  { key: "delete", title: "Delete Eligible Records", description: "Permanently remove records only when permitted and safe.", icon: Trash2, permission: "data:preview",
    steps: ["Select business", "Select module", "Select records", "Dependency analysis", "Approval", "Typed confirmation", "Execute"], target: (t) => `/data-management?tenant=${t}&op=delete` },
  { key: "opening-balance", title: "Opening Balance Reset", description: "Establish a verified new opening position.", icon: CalendarCheck, permission: "data:preview",
    steps: ["Select business", "Select cutoff", "Reconcile", "Review opening balances", "Approval", "Execute", "Verify"], target: (t) => `/data-management/close?tenant=${t}` },
  { key: "reset-data", title: "Reset Business Data", description: "Wipe a business's transactional data and start fresh. You choose what to keep.", icon: Eraser, permission: "data:preview",
    steps: ["Select business", "Configure", "Preview", "Confirm", "Execute", "Results"], target: (t) => `/data-management/reset?tenant=${t}` },
  { key: "import", title: "Import Data", description: "Upload and validate business records.", icon: Upload, permission: "data:view",
    steps: ["Select business", "Select module", "Upload file", "Map columns", "Validate", "Confirm", "Import"], target: null,
    unavailable: { why: "Super Admin cannot import records into a business. Imports change business data, so they run inside the business with its own validation, permissions and audit trail.", instead: "A business user with import access uploads the file from the module itself (for example Inventory → Products → Import)." } },
  { key: "export", title: "Export Data", description: "Export authorized business data and reports.", icon: Download, permission: "data:view",
    steps: ["Select business", "Select data", "Date range", "Format", "Export", "Download"], target: (t) => `/tenants/${t}?tab=profile` },
];

export const cardFor = (key: string | null | undefined) => OPERATION_CARDS.find((c) => c.key === key);
