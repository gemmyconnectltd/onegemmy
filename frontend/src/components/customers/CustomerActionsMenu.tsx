"use client";

import Link from "next/link";
import { Menu } from "@base-ui/react/menu";
import { Archive, Eye, FileText, History, MoreHorizontal, Pencil, Power, RotateCcw, ShoppingCart, Trash2, Wallet } from "lucide-react";
import type { ApiCustomer, CustomerStatus } from "@/lib/api/sales";
import { useCan } from "@/lib/can";
import { useAuth } from "@/lib/auth";

const row = "flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-sm outline-none data-highlighted:bg-surface data-highlighted:text-foreground";

/** Secondary actions for one customer. Only what the customer's status and the person's permissions allow is listed;
 *  permanent deletion sits apart at the bottom, for owners and administrators. The server re-checks every action. */
export function CustomerActionsMenu({ customer, onEdit, onStatus, onDelete, showView = true }: {
  customer: ApiCustomer; onEdit?: () => void; onStatus: (status: CustomerStatus) => void; onDelete?: () => void; showView?: boolean;
}) {
  const can = useCan();
  const { isAdmin } = useAuth();
  const status: CustomerStatus = customer.status ?? (customer.is_active ? "active" : "inactive");
  const canEdit = can("contacts", "update");
  const canSell = status === "active" && (can("pos", "create") || can("orders", "create"));
  const canSeeDebt = can("accounts_receivable", "read");
  return <Menu.Root modal={false}>
    <Menu.Trigger aria-label={`More actions for ${customer.name}`} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-accent data-popup-open:border-accent data-popup-open:text-accent"><MoreHorizontal size={18} /></Menu.Trigger>
    <Menu.Portal><Menu.Positioner align="end" sideOffset={6} collisionPadding={12} className="z-50"><Menu.Popup className="w-60 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-border bg-card py-2 text-foreground shadow-lg outline-none" style={{ maxHeight: "var(--available-height)" }}>
      {showView && <Menu.LinkItem render={<Link href={`/customers/${customer.id}`} />} className={row}><Eye size={17} /> View customer</Menu.LinkItem>}
      {canEdit && onEdit && <Menu.Item className={row} onClick={onEdit}><Pencil size={17} /> Edit customer</Menu.Item>}
      {can("orders", "read") && <Menu.LinkItem render={<Link href={`/customers/${customer.id}#orders`} />} className={row}><History size={17} /> Sales history</Menu.LinkItem>}
      {canSeeDebt && <Menu.LinkItem render={<Link href={`/debts/statements?kind=receivable&party=${customer.id}`} />} className={row}><FileText size={17} /> Customer statement</Menu.LinkItem>}
      {canSell && <Menu.LinkItem render={<Link href={`/pos?customer=${customer.id}`} />} className={row}><ShoppingCart size={17} /> Create sale</Menu.LinkItem>}
      {canSeeDebt && can("accounts_receivable", "create") && <Menu.LinkItem render={<Link href={`/debts/receivables?search=${encodeURIComponent(customer.name)}`} />} className={row}><Wallet size={17} /> Record payment</Menu.LinkItem>}
      {canEdit && <>
        <div className="my-1.5 border-t border-border" />
        {status === "active" && <Menu.Item className={row} onClick={() => onStatus("inactive")}><Power size={17} /> Deactivate</Menu.Item>}
        {status !== "archived" && <Menu.Item className={row} onClick={() => onStatus("archived")}><Archive size={17} /> Archive</Menu.Item>}
        {status !== "active" && <Menu.Item className={`${row} text-accent`} onClick={() => onStatus("active")}><RotateCcw size={17} /> Reactivate</Menu.Item>}
      </>}
      {onDelete && isAdmin() && can("contacts", "delete") && <>
        <div className="my-1.5 border-t border-border" />
        <Menu.Item className={`${row} text-red-600 dark:text-red-400`} onClick={onDelete}><Trash2 size={17} /> Delete permanently</Menu.Item>
      </>}
    </Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}
