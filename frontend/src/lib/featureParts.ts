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
