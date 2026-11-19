/** Submodules and features inside modules (see backend app/modules/tenants/feature_tree.py). Pesaa can switch one off
 *  for every business or restrict it for one. The module keeps working; that part's pages stay open read-only so
 *  records can still be looked up and reconciled, and the server refuses new changes there. */
export type PartStatus = "on" | "switched_off" | "restricted" | "module_off";

/** ERP page prefix -> part key. Page paths differ from API paths, so they are listed here, longest prefix first. */
const PAGE_PARTS: [string, string, string][] = [
  ["/inventory/transfers", "inventory.transfers", "Stock transfers"],
  ["/inventory/counts", "inventory.stock_counts", "Stock counts"],
  ["/inventory/batches", "inventory.batches", "Batch tracking"],
  ["/inventory/serials", "inventory.serials", "Serial numbers"],
  ["/inventory/warranty", "inventory.warranty", "Warranty"],
  ["/inventory/brands", "inventory.brands", "Brands"],
  ["/sales/quotations", "sales.quotations", "Quotations"],
  ["/sales/returns", "sales.returns", "Sales returns"],
  ["/sales/targets", "sales.targets", "Sales targets"],
  ["/sales/deals", "sales.deals", "Deals"],
  ["/procurement/requests", "procurement.requisitions", "Purchase requests"],
  ["/procurement/bills", "procurement.supplier_bills", "Supplier bills"],
  ["/procurement/returns", "procurement.purchase_returns", "Purchase returns"],
  ["/accounting/payroll", "hr.payroll", "Payroll"],
  ["/hr/attendance", "hr.attendance", "Attendance"],
  ["/hr/leave", "hr.leave", "Leave"],
  ["/hr/payroll", "hr.payroll", "Payroll"],
  ["/hr/recruiting", "hr.recruitment", "Recruitment"],
  ["/crm/campaigns", "crm.campaigns", "Campaigns"],
  ["/crm/emails", "crm.campaigns", "Campaigns"],
];

export function partForPath(path: string): { key: string; name: string } | null {
  const hit = PAGE_PARTS.find(([prefix]) => path === prefix || path.startsWith(prefix + "/"));
  return hit ? { key: hit[1], name: hit[2] } : null;
}

/** "switched_off" | "restricted" when the page at `path` is read-only, else null. "module_off" is the module guard's job. */
export function readOnlyReason(path: string, parts: Record<string, PartStatus> | undefined): "switched_off" | "restricted" | null {
  const part = partForPath(path);
  const status = part ? parts?.[part.key] : undefined;
  return status === "switched_off" || status === "restricted" ? status : null;
}

export function readOnlyMessage(name: string, reason: "switched_off" | "restricted"): string {
  return reason === "switched_off"
    ? `${name} is paused by Pesaa right now. You can still open and look up your records, but you can't create or change them here.`
    : `${name} is restricted for your business. You can still open and look up your records, but you can't create or change them. Contact Pesaa support to have it restored.`;
}

/** Pesaa's controls for the signed-in person (only features that are not plain Active are listed). */
export interface ControlState {
  status: "active" | "inactive" | "coming_soon" | "beta" | "maintenance" | "deprecated";
  visible: boolean; writable: boolean; message: string | null;
  level: "none" | "info" | "warning" | "blocked"; blocked_actions: string[];
}

export interface PageNotice { name: string; message: string; tone: "info" | "warning" | "readonly"; blockedActions: string[] }

const ACTION_WORDS: Record<string, string> = { create: "creating", edit: "editing", delete: "deleting", approve: "approving", import: "importing", export: "exporting" };

/** The notice for a page: the part's controls and restriction first, then its module's. Most severe wins. */
export function noticeFor(path: string, moduleKey: string | null, parts: Record<string, PartStatus> | undefined,
  controls: Record<string, ControlState> | undefined): PageNotice | null {
  const part = partForPath(path);
  const restricted = readOnlyReason(path, parts);
  const candidates: (PageNotice & { rank: number })[] = [];
  for (const key of [part?.key, moduleKey]) {
    const c = key ? controls?.[key] : undefined;
    if (!c) continue;
    const name = key === part?.key ? part!.name : (moduleKey ?? "").replace(/^./, (x) => x.toUpperCase());
    const message = c.message ?? (c.visible ? `${name} is not taking changes right now.` : `${name} is not available for your business yet.`);
    if (!c.writable) candidates.push({ name, message, tone: "readonly", blockedActions: [], rank: 3 });
    else if (c.level === "warning") candidates.push({ name, message, tone: "warning", blockedActions: c.blocked_actions, rank: 2 });
    else if (c.level === "info" && c.message) candidates.push({ name, message, tone: "info", blockedActions: c.blocked_actions, rank: 1 });
    else if (c.blocked_actions.length) {
      const words = c.blocked_actions.map((a) => ACTION_WORDS[a] ?? a);
      candidates.push({ name, message: `In ${name}, ${words.join(", ")} ${words.length === 1 ? "is" : "are"} switched off or limited to administrators.`, tone: "warning", blockedActions: c.blocked_actions, rank: 0 });
    }
  }
  if (restricted && part) candidates.push({ name: part.name, message: readOnlyMessage(part.name, restricted), tone: "readonly", blockedActions: [], rank: 3 });
  candidates.sort((a, b) => b.rank - a.rank);
  return candidates[0] ?? null;
}

/** For the module sidebar: hide parts that are not available yet, lock the read-only ones. */
export function linkState(href: string, parts: Record<string, PartStatus> | undefined, controls: Record<string, ControlState> | undefined): "hidden" | "locked" | null {
  const part = partForPath(href);
  const c = part ? controls?.[part.key] : undefined;
  if (c && !c.visible) return "hidden";
  if ((c && !c.writable) || readOnlyReason(href, parts)) return "locked";
  return null;
}
