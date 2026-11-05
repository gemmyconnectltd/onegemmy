"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, Edit2, MoreHorizontal, PackagePlus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useCan } from "@/lib/can";
import { useAppConfig } from "@/lib/appConfig";
import { fmtMoney } from "@/lib/config";
import { ProductGallery } from "@/components/inventory/ProductGallery";
import { useProductDetails, useUpdateProduct, useRestockProduct, useUploadProductImage } from "@/lib/api/hooks";
import { ProductAvatar } from "./ProductAvatar";
import { ProductFormDrawer, type ProductFormValues } from "./ProductFormDrawer";
import { RestockDrawer } from "./RestockDrawer";
import { ProductActivityView } from "./ProductActivity";
import { VariantsDrawer } from "./VariantsDrawer";
import { PageLoader } from "@/components/ui/PageLoader";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";

export function ProductDetailsView({id, initialTab = "overview"}: {id: string; initialTab?: string}) {
  const query = useProductDetails(id);
  const {user, activeBranchId} = useAuth();
  // Reset per-context activity state when switching workspace or identity.
  const contextKey = `${user?.id}:${activeBranchId}:${id}`;
  const {currencySymbol, vatEnabled} = useAppConfig();
  const can = useCan();
  const {confirm, dialog} = useConfirmDialog();
  const router = useRouter();
  const [tab, setTab] = useState(initialTab);
  const [editing, setEditing] = useState(false);
  const [restocking, setRestocking] = useState(false);
  const [variants, setVariants] = useState(false);
  const [copied, setCopied] = useState(false);
  const update = useUpdateProduct(); const restock = useRestockProduct(); const upload = useUploadProductImage();
  const data = query.data; const p = data?.product;
  const restricted = user?.branchIds != null || user?.branchId != null;
  const fmt = (value: number) => fmtMoney(value, currencySymbol);
  if (query.isLoading) return <PageLoader variant="page" />;
  const errorInfo = query.error as {status?:number; detail?:string; message?:string} | null;
  if (query.error || !p || !data) return <div className="space-y-4 rounded-xl border border-border bg-card p-6" role="alert"><h1 className="pesaa-page-title">{errorInfo?.status===404?"Product not found":errorInfo?.status===403?"Access denied":"Product unavailable"}</h1><p>{errorInfo?.detail || errorInfo?.message || "This product was not found or you do not have access."}</p><Button variant="secondary" onClick={()=>void query.refetch()}>Try again</Button><Link className="ml-4 text-accent" href="/inventory/products">Back to products</Link></div>;
  const initial: ProductFormValues = {name:p.name,sku:p.sku??"",barcode:p.barcode??"",subcategory:p.subcategory??"",category:p.category?.name??"",category_id:p.category_id??"",brand:p.brand?.name??"",brand_id:p.brand_id??"",unit:p.unit?.name??"",unit_id:p.unit_id??"",price:p.price,cost:p.cost,stock:p.stock,minStock:p.min_stock,image_url:p.image_url};
  const tabs = [["overview","Overview"],["stock","Stock"],["history","History"],...(data.modules.includes("sales") ? [["sales","Sales"]] : []),...(data.modules.includes("procurement") ? [["purchases","Purchases"]] : []),["transfers","Transfers"],["adjustments","Adjustments"],...(p.tracks_serials ? [["serials","Serials"]] : [])];
  const activeTab = tabs.some(([key])=>key===tab) ? tab : "overview";
  const details: [string, string | number | null | undefined][] = [["Description",p.description],["SKU",p.sku],["Barcode",p.barcode],["Category",p.category?.name],["Subcategory",p.subcategory],["Brand",p.brand?.name],["Unit",p.unit?.name],["Product type",p.has_variants?"With variants":p.sale_by_weight?"Sold by weight":"Standard"],["Supplier",p.supplier?.name],["Selling price",fmt(p.price)],["Cost price",fmt(p.cost)],["Tax",vatEnabled ? "VAT-inclusive prices; transaction tax rules apply" : "VAT disabled for this business"],["Status",p.is_active?"Active":"Inactive"],["Created",p.created_at?new Date(p.created_at).toLocaleString():null],["Updated",p.updated_at?new Date(p.updated_at).toLocaleString():null]];
  return <div className="min-w-0 space-y-6">
    {dialog}
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-muted"><Link href="/inventory">Inventory</Link><span>/</span><Link href="/inventory/products">Products</Link><span>/</span><span className="break-words text-foreground">{p.name}</span></nav>
    <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" onClick={()=>router.back()}><ArrowLeft size={16}/> Back</Button><div className="flex flex-wrap gap-2">{can("items","update") && <Button onClick={()=>setEditing(true)}><Edit2 size={16}/> Edit product</Button>}<details className="relative"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm"><MoreHorizontal size={18}/> More actions</summary><div className="absolute right-0 z-10 mt-2 w-56 space-y-2 rounded-xl border border-border bg-card p-3 shadow-lg">{can("items","update") && <Button variant="ghost" onClick={()=>confirm({title:p.is_active?"Deactivate product":"Activate product",message:p.is_active?"This product will be unavailable for new sales. Existing transactions and history remain available.":"Make this product available for new sales?",confirmLabel:p.is_active?"Deactivate":"Activate",onConfirm:async()=>{await update.mutateAsync({id,data:{is_active:!p.is_active}});}})}>{p.is_active?"Deactivate product":"Activate product"}</Button>}{can("stock","create") && !restricted && <Button variant="ghost" onClick={()=>p.has_variants?setVariants(true):setRestocking(true)}><PackagePlus size={16}/> Adjust / restock</Button>}<Link className="flex min-h-11 items-center text-sm text-accent" href="/inventory/transfers">Stock transfers</Link>{p.has_variants && <Button variant="ghost" onClick={()=>setVariants(true)}>View variants</Button>}</div></details></div></div>
    <header className="rounded-xl border border-border bg-card p-4 sm:p-6"><div className="flex items-start gap-4"><ProductAvatar name={p.name} imageUrl={p.image_url} size={72} className="rounded-xl"/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><h1 className="pesaa-page-title break-words">{p.name}</h1><span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold">{p.is_active?"Active":"Inactive"}</span></div><div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted"><span className="break-all">{p.sku||"No SKU"}</span>{p.sku && <Button variant="ghost" size="sm" aria-label="Copy SKU" onClick={async()=>{try{await navigator.clipboard.writeText(p.sku!);setCopied(true);}catch{setCopied(false);}}}><Copy size={14}/>{copied?"Copied":"Copy"}</Button>}</div><p className="mt-2 text-sm text-muted">{[p.category?.name||"Uncategorized",p.brand?.name||"No brand",p.unit?.name||"Unit not set"].join(" · ")}</p></div></div></header>
    <ProductGallery productId={id} canEdit={can("items","update")} />
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">{[["Current stock",data.current_stock==null?"Branch balance unavailable":`${data.current_stock} ${p.unit?.abbreviation||p.unit?.name||"units"}`],["Cost price",fmt(p.cost)],["Selling price",fmt(p.price)],["Margin",p.price>0?`${(((p.price-p.cost)/p.price)*100).toFixed(1)}%`:"Not available"],["Total sold",data.total_sold==null?"Not available":`${data.total_sold} units`]].map(([label,value])=><div key={label} className="min-w-0 rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted">{label}</p><p className="mt-2 break-words text-lg font-semibold tabular-nums">{value}</p>{label==="Current stock"&&<p className="mt-1 text-xs text-muted">{data.current_stock==null?"Select all branches for the business total":"Business-wide balance"}</p>}</div>)}</div>
    <div role="tablist" aria-label="Product sections" className="flex gap-6 overflow-x-auto border-b border-border">{tabs.map(([key,label])=><button key={key} role="tab" aria-selected={activeTab===key} aria-controls="product-panel" onClick={()=>setTab(key)} className={`min-h-11 shrink-0 border-b-2 px-1 text-sm font-semibold ${activeTab===key?"border-accent text-accent":"border-transparent text-muted"}`}>{label}</button>)}</div>
    <section id="product-panel" role="tabpanel" aria-label={activeTab}>
      {activeTab==="overview" ? <div className="rounded-xl border border-border bg-card p-4 sm:p-6"><h2 className="pesaa-section-title">General information</h2><dl className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{details.map(([label,value])=><div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{value||"Not recorded"}</dd></div>)}</dl>{p.has_variants && <div className="mt-6 border-t border-border pt-4"><h3 className="text-sm font-semibold">Variants</h3><p className="mt-1 text-sm text-muted">SKU, pricing and stock for this product are managed per variant.</p><Button className="mt-3" variant="secondary" onClick={()=>setVariants(true)}>Manage variants</Button></div>}</div> : activeTab==="stock" ? <div className="space-y-6"><div className="rounded-xl border border-border bg-card p-6"><h2 className="pesaa-section-title">Stock availability</h2><p className="mt-3 text-sm">{data.current_stock==null?"Branch stock is not recorded by this inventory system.":`${data.current_stock} business-wide stock units · ${data.current_stock<=p.min_stock?"At or below reorder threshold":"Above reorder threshold"}`}</p><p className="mt-2 text-sm text-muted">Reorder threshold: {p.min_stock}. Available and reserved quantities are not tracked separately.</p><p className="mt-2 text-sm text-muted">{data.limitations[0]}</p><div className="mt-4 flex flex-wrap gap-3">{!restricted && can("stock","create") && <Button onClick={()=>p.has_variants?setVariants(true):setRestocking(true)}>Adjust stock</Button>}<Link className="inline-flex min-h-11 items-center text-sm font-semibold text-accent" href="/inventory/transfers">Manage transfers →</Link><Link className="inline-flex min-h-11 items-center text-sm font-semibold text-accent" href="/inventory/stock">Stock workspace →</Link></div></div><ProductActivityView key={`${contextKey}:stock`} id={id} name={p.name} category="movements" compact/></div> : activeTab==="serials" ? <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6"><h2 className="pesaa-section-title">Serial tracking</h2><p className="text-sm text-muted">This product tracks individual serial numbers. Register and review them in the stock workspace.</p><Link href="/inventory/stock?tab=serials"><Button>Open serial registry</Button></Link></div> : <ProductActivityView key={`${contextKey}:${activeTab}`} id={id} name={p.name} kind={activeTab==="sales"?"sale":activeTab==="purchases"?"purchase":activeTab==="transfers"?"transfer":activeTab==="adjustments"?"adjustment":undefined}/>}
    </section>
    <p className="text-xs text-muted">{data.limitations.slice(1).join(" ")}</p>
    <ProductFormDrawer key={`${p.updated_at}:${editing}`} open={editing} onClose={()=>setEditing(false)} initial={initial} onSubmit={async(v,image)=>{
      const payload: Record<string,unknown> = {name:v.name,sku:v.sku||null,barcode:v.barcode||null,subcategory:v.subcategory||null,category_id:v.category_id||null,brand_id:v.brand_id||null,unit_id:v.unit_id||null,price:v.price,cost:v.cost,min_stock:v.minStock};
      if(!p.has_variants && !restricted && can("stock","update")) payload.stock=v.stock;
      await update.mutateAsync({id,data:payload});if(image) await upload.mutateAsync({id,file:image});setEditing(false);
    }}/>
    <RestockDrawer open={restocking} onClose={()=>setRestocking(false)} productName={p.name} currentStock={p.stock} onSubmit={async(v)=>{await restock.mutateAsync({id,data:{qty:v.qty,mode:v.mode,reason:v.reason,notes:v.notes}});setRestocking(false);}}/>
    <VariantsDrawer open={variants} onClose={()=>setVariants(false)} productId={id} productName={p.name}/>
  </div>;
}
