"use client";
import { useDeferredValue, useState } from "react";
import { Plus } from "lucide-react";
import { useExpenseCategories, useSaveExpenseCategory } from "@/lib/api/hooks";
import type { ExpenseCategory } from "@/lib/api/expenseWorkspace";
import { Input, Textarea } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { PageLoader } from "@/components/ui/PageLoader";
import { FinancialError, FinancialPagination } from "@/components/accounting/FinancialShared";
import { ExpenseDenied, ExpenseHeader, useExpenseContext } from "./ExpenseShared";
export function ExpenseCategories() {
  const { scope } = useExpenseContext();
  return <Categories key={scope} />;
}
function Categories() {
  const { scope, can } = useExpenseContext();
  const [page, setPage] = useState(1), [search, setSearch] = useState("");
  const deferred = useDeferredValue(search);
  const query = useExpenseCategories(page, deferred, scope, can("read"));
  const [editing, setEditing] = useState<ExpenseCategory | "new" | null>(null);
  const save = useSaveExpenseCategory();
  return <div className="space-y-5"><ExpenseHeader title="Categories" description="Organize expense categories independently of product categories." />
    <div className="flex flex-wrap justify-between gap-3"><div className="w-64 max-w-full"><Input aria-label="Search expense categories" placeholder="Search categories…" value={search} onChange={e => {setSearch(e.target.value); setPage(1);}} /></div>{can("create") && <Button onClick={() => setEditing("new")}><Plus size={14} />Add Category</Button>}</div>
    {!can("read") ? <ExpenseDenied /> : query.isLoading ? <PageLoader variant="compact" /> : query.error ? <FinancialError error={query.error} /> : <section className="overflow-hidden rounded-xl border border-border bg-card"><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead className="border-b border-border bg-surface/50 text-[10px] uppercase tracking-wide text-muted"><tr>{["Category", "Description", "Status", "Actions"].map(label => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{query.data?.items.map(category => <tr key={category.id}><td className="px-4 py-3 font-semibold">{category.name}</td><td className="px-4 py-3 text-muted">{category.description || "—"}</td><td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-[10px] ${category.is_active ? "bg-accent/10 text-accent" : "bg-surface text-muted"}`}>{category.is_active ? "Active" : "Archived"}</span></td><td className="px-4 py-3">{can("update") && <Button size="sm" variant="ghost" onClick={() => setEditing(category)}>Edit</Button>}</td></tr>)}</tbody></table></div>{!query.data?.items.length && <p className="p-10 text-center text-xs text-muted">No expense categories. Add a category to get started.</p>}<div className="px-4 pb-2"><FinancialPagination page={page} size={25} total={query.data?.total || 0} onPage={setPage} /></div></section>}
    {editing && <CategoryForm key={editing === "new" ? "new" : editing.id} category={editing === "new" ? undefined : editing} saving={save.isPending} error={save.error} onClose={() => setEditing(null)} onSave={data => save.mutate({id: editing === "new" ? undefined : editing.id, data}, {onSuccess: () => setEditing(null)})} />}
  </div>;
}
function CategoryForm({ category, saving, error, onClose, onSave }: { category?: ExpenseCategory; saving: boolean; error: unknown; onClose: () => void; onSave: (data: Omit<ExpenseCategory, "id">) => void }) {
  const [name, setName] = useState(category?.name || ""), [description, setDescription] = useState(category?.description || ""), [active, setActive] = useState(category?.is_active ?? true);
  return <Drawer open title={category ? "Edit Expense Category" : "Add Expense Category"} onClose={() => {if (!saving) onClose();}}><form className="space-y-4 p-5" onSubmit={event => {event.preventDefault(); if (!saving) onSave({name: name.trim(), description: description.trim() || null, is_active: active});}}><label className="block text-xs font-medium">Name<Input autoFocus required maxLength={50} value={name} onChange={e => setName(e.target.value)} disabled={saving} /></label><label className="block text-xs font-medium">Description<Textarea rows={3} maxLength={255} value={description} onChange={e => setDescription(e.target.value)} disabled={saving} /></label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} disabled={saving} />Active</label>{category && <p className="text-[11px] leading-relaxed text-muted">Renaming updates this category on existing expenses. Archive to stop new use while keeping expense history.</p>}<FinancialError error={error} /><div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || !name.trim()}>{saving ? "Saving…" : "Save Category"}</Button></div></form></Drawer>;
}
