"use client";

import Link from "next/link";
import { Menu } from "@base-ui/react/menu";
import { Eye, Edit2, History, ArrowLeftRight, SlidersHorizontal, Trash2, MoreHorizontal, Layers, PackagePlus } from "lucide-react";
import type { ApiProduct } from "@/lib/api";
import { useCan } from "@/lib/can";
import { useAuth } from "@/lib/auth";

const row = "flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left text-sm outline-none data-highlighted:bg-surface data-highlighted:text-foreground";
export function ProductActionsMenu({product, onEdit, onAdjust, onRestock, onStatus, onVariants, onRequest, onDelete}: {
  product: ApiProduct; onEdit: () => void; onAdjust: () => void; onRestock: () => void;
  onStatus: () => void; onVariants: () => void; onRequest?: () => void; onDelete?: () => void;
}) {
  const can = useCan();
  const {user} = useAuth();
  const restricted = user?.branchIds != null || user?.branchId != null;
  const canEdit = can("items", "update");
  // Drawers own scroll locking. A modal menu can leave its lock captured by a drawer.
  return <Menu.Root modal={false}>
    <Menu.Trigger aria-label={`Actions for ${product.name}`} className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-card text-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-accent data-popup-open:border-accent data-popup-open:text-accent"><MoreHorizontal size={20}/></Menu.Trigger>
    <Menu.Portal><Menu.Positioner align="end" sideOffset={6} className="z-50"><Menu.Popup className="w-60 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-border bg-card py-2 text-foreground shadow-lg outline-none" style={{maxHeight:"var(--available-height)"}}>
      <Menu.LinkItem render={<Link href={`/inventory/products/${product.id}`}/>} className={row}><Eye size={18}/> View Details</Menu.LinkItem>
      {canEdit && <Menu.Item className={row} onClick={onEdit}><Edit2 size={18}/> Edit Product</Menu.Item>}
      <Menu.LinkItem render={<Link href={`/inventory/products/${product.id}?tab=history`}/>} className={row}><History size={18}/> Stock History</Menu.LinkItem>
      {can("stock","create") && <Menu.LinkItem render={<Link href={`/inventory/transfers?product=${product.id}&create=1`}/>} className={row}><ArrowLeftRight size={18}/> Transfer Stock</Menu.LinkItem>}
      {can("stock","create") && !restricted && <Menu.Item className={row} onClick={onAdjust}><SlidersHorizontal size={18}/> Adjust Stock</Menu.Item>}
      {canEdit && <Menu.Item className={`${row} ${product.is_active?"text-red-600":"text-accent"}`} onClick={onStatus}><Trash2 size={18}/> {product.is_active?"Deactivate":"Activate"}</Menu.Item>}
      <div className="my-2 border-t border-border"/>
      {can("stock","create") && !restricted && <Menu.Item className={row} onClick={onRestock}><PackagePlus size={18}/> Restock</Menu.Item>}
      <Menu.Item className={row} onClick={onVariants}><Layers size={18}/> Variants</Menu.Item>
      {onRequest && <Menu.Item className={row} onClick={onRequest}><Edit2 size={18}/> Request a change</Menu.Item>}
      {onDelete && can("items","delete") && <Menu.Item className={`${row} text-red-600`} onClick={onDelete}><Trash2 size={18}/> Delete permanently</Menu.Item>}
    </Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}
