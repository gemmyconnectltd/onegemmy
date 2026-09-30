"use client";
import { useAppConfig } from "@/lib/appConfig";

import { useState } from "react";
import { Sparkles, Plus, Search, Edit2, Trash2, MoreVertical, Clock, Tags, Layers, Check, X, Upload } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { fmtMoney } from "@/lib/config";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea, FormFooter } from "@/components/ui/Form";
import { type ApiService } from "@/lib/api";
import {
  useServices, useCreateService, useUpdateService, useDeleteService,
  useServiceCategories, useCreateServiceCategory, useUpdateServiceCategory, useDeleteServiceCategory,
  useEmployeeServices,
} from "@/lib/api/hooks";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/useBulkSelection";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Pagination } from "@/components/ui/Pagination";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import ImportServiceTemplatesModal from "@/components/services/ImportServiceTemplatesModal";

interface ServiceFormValues {
  name: string;
  category_id: string;
  description: string;
  price: string;
  cost: string;
  duration_minutes: string;
  is_active: boolean;
}

const EMPTY_FORM: ServiceFormValues = {
  name: "", category_id: "", description: "", price: "", cost: "", duration_minutes: "30", is_active: true,
};

function toFormValues(s: ApiService): ServiceFormValues {
  return {
    name: s.name,
    category_id: s.category_id ?? "",
    description: s.description ?? "",
    price: String(s.price),
    cost: String(s.cost),
    duration_minutes: String(s.duration_minutes),
    is_active: s.is_active,
  };
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function ServiceCatalogPage() {
  const { brandColor, currencySymbol } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);
  const SVC_COLOR = brandColor;

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const onSearchChange = (v: string) => { setSearch(v); setPage(1); };
  const onCategoryFilterChange = (v: string) => { setCategoryFilter(v); setPage(1); };
  const onStatusFilterChange = (f: "all" | "active" | "inactive") => { setStatusFilter(f); setPage(1); };

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ApiService | null>(null);
  const [formValues, setFormValues] = useState<ServiceFormValues>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<ApiService | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const isActive = statusFilter === "all" ? undefined : statusFilter === "active";
  const categoryId = categoryFilter === "all" ? undefined : categoryFilter;
  const { data, isLoading, isFetching } = useServices(page, pageSize, debouncedSearch || undefined, categoryId, isActive);
  const { data: categoriesData } = useServiceCategories();
  const { data: employeeServices } = useEmployeeServices();
  const categories = categoriesData?.items ?? [];
  const services = data?.items ?? [];
  const total = data?.total ?? 0;

  const createService = useCreateService();
  const updateService = useUpdateService();
  const deleteService = useDeleteService();

  const bulk = useBulkSelection(services.map((s) => s.id));
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function staffFor(serviceId: string) {
    return (employeeServices ?? []).filter((es) => es.service_id === serviceId);
  }

  function confirmBulkDelete() {
    confirm({
      title: "Delete Services",
      message: `Delete ${bulk.count} selected service${bulk.count === 1 ? "" : "s"}? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setBulkDeleting(true);
        await Promise.allSettled(Array.from(bulk.selected).map((id) => deleteService.mutateAsync(id)));
        setBulkDeleting(false);
        bulk.clear();
      },
    });
  }

  function openAdd() {
    setEditing(null);
    setFormValues(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(s: ApiService) {
    setEditing(s);
    setFormValues(toFormValues(s));
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload = {
      name: formValues.name.trim(),
      category_id: formValues.category_id || null,
      description: formValues.description.trim() || null,
      price: Number(formValues.price) || 0,
      cost: Number(formValues.cost) || 0,
      duration_minutes: Number(formValues.duration_minutes) || 30,
      is_active: formValues.is_active,
    };
    if (editing) {
      await updateService.mutateAsync({ id: editing.id, data: payload });
    } else {
      await createService.mutateAsync(payload);
    }
    setShowForm(false);
    setEditing(null);
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteService.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Service Catalog</h1>
          <p className="text-sm text-muted mt-0.5">{total} service{total === 1 ? "" : "s"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowImport(true)} className="rounded-lg">
            <Upload size={15} /> Import
          </Button>
          <Button variant="secondary" onClick={() => setShowCategories(true)} className="rounded-lg">
            <Tags size={15} /> Categories
          </Button>
          <Button onClick={openAdd} color={SVC_COLOR} className="rounded-lg">
            <Plus size={15} /> Add Service
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input type="text" placeholder="Search services..." value={search} onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none bg-surface/50" />
          </div>
          <select value={categoryFilter} onChange={(e) => onCategoryFilterChange(e.target.value)}
            className="px-3 py-2 border border-border rounded-lg text-sm bg-surface/50 outline-none focus:border-foreground/30">
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-1 bg-surface rounded-lg p-1">
            {(["all", "active", "inactive"] as const).map((f) => (
              <button key={f} onClick={() => onStatusFilterChange(f)}
                style={statusFilter === f ? { backgroundColor: SVC_COLOR } : {}}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md capitalize transition-colors ${statusFilter === f ? "text-white" : "text-muted hover:text-foreground"}`}>
                {f}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted ml-auto">{total} result{total === 1 ? "" : "s"}</span>
        </div>

        {bulk.count > 0 && (
          <div className="px-5 py-3 border-b border-border">
            <BulkActionBar count={bulk.count} label="service" onDelete={confirmBulkDelete} onClear={bulk.clear} deleting={bulkDeleting} />
          </div>
        )}

        <div className={`overflow-x-auto transition-opacity ${isFetching ? "opacity-60" : ""}`}>
          <table className="w-full min-w-160">
            <thead>
              <tr className="border-b border-border bg-surface/50 text-left">
                <th className="px-5 py-3 w-10">
                  <input type="checkbox" checked={bulk.allSelected} ref={(el) => { if (el) el.indeterminate = bulk.someSelected; }} onChange={bulk.toggleAll} className="w-4 h-4 rounded" disabled={services.length === 0} />
                </th>
                {["Service", "Category", "Price", "Duration", "Staff", "Status", ""].map((h, i) => (
                  <th key={i} className={`px-5 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider ${["Price", "Duration"].includes(h) ? "text-right" : h === "Status" ? "text-center" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {services.map((s) => {
                const staff = staffFor(s.id);
                return (
                  <tr key={s.id} className="hover:bg-surface/40 transition-colors group">
                    <td className="px-5 py-3.5">
                      <input type="checkbox" checked={bulk.selected.has(s.id)} onChange={() => bulk.toggle(s.id)} className="w-4 h-4 rounded" />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${SVC_COLOR}15` }}>
                          <Sparkles size={15} style={{ color: SVC_COLOR }} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{s.name}</p>
                          {s.description && <p className="text-[11px] text-muted line-clamp-1">{s.description}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface text-muted">
                        {s.category?.name ?? "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-sm font-semibold text-foreground tabular-nums">{fmt(s.price)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="inline-flex items-center gap-1 text-sm text-muted tabular-nums">
                        <Clock size={12} /> {formatDuration(s.duration_minutes)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-muted">
                      {staff.length === 0 ? "—" : `${staff.length} staff`}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${s.is_active ? "bg-emerald-50 text-emerald-700" : "bg-surface text-muted"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${s.is_active ? "bg-emerald-500" : "bg-muted"}`} />
                        {s.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 relative">
                      <button onClick={() => setOpenMenu(openMenu === s.id ? null : s.id)}
                        className="w-7 h-7 flex items-center justify-center text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                        <MoreVertical size={14} />
                      </button>
                      {openMenu === s.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                          <div className="absolute right-4 top-full mt-1 w-36 bg-card border border-border rounded-xl shadow-lg z-20 py-1.5 overflow-hidden">
                            <button onClick={() => { setOpenMenu(null); openEdit(s); }}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-foreground hover:bg-surface transition-colors">
                              <Edit2 size={13} className="text-muted" /> Edit
                            </button>
                            <button onClick={() => { setOpenMenu(null); setDeleteTarget(s); }}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                              <Trash2 size={13} /> Delete
                            </button>
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {services.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <Sparkles size={36} className="text-border mx-auto mb-3" />
                    <p className="text-sm font-semibold text-muted">No services found</p>
                    <p className="text-xs text-muted/70 mt-1">
                      {debouncedSearch || categoryFilter !== "all" || statusFilter !== "all"
                        ? "Try adjusting your search or filters"
                        : "Add your first service, or import a starter catalog"}
                    </p>
                    {!debouncedSearch && categoryFilter === "all" && statusFilter === "all" && (
                      <button onClick={() => setShowImport(true)} className="mt-3 text-sm font-semibold hover:underline" style={{ color: SVC_COLOR }}>
                        <span className="inline-flex items-center gap-1.5"><Upload size={13} /> Import services</span>
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} itemLabel="services" color={SVC_COLOR} />
      </div>

      <Drawer
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Edit Service" : "Add Service"}
        description={editing ? "Update this service's details" : "Add a new service to your catalog"}
      >
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <Field label="Name" required>
            <Input required autoFocus value={formValues.name} onChange={(e) => setFormValues({ ...formValues, name: e.target.value })} placeholder="e.g. Haircut" />
          </Field>
          <Field label="Category">
            <Select value={formValues.category_id} onChange={(e) => setFormValues({ ...formValues, category_id: e.target.value })}>
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Description">
            <Textarea rows={2} value={formValues.description} onChange={(e) => setFormValues({ ...formValues, description: e.target.value })} placeholder="Short description (optional)" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price" required>
              <Input required type="number" min="0" step="0.01" value={formValues.price} onChange={(e) => setFormValues({ ...formValues, price: e.target.value })} placeholder="0.00" />
            </Field>
            <Field label="Duration (minutes)" required>
              <Input required type="number" min="1" step="1" value={formValues.duration_minutes} onChange={(e) => setFormValues({ ...formValues, duration_minutes: e.target.value })} placeholder="30" />
            </Field>
          </div>
          <Field label="Internal cost" hint="Cost of consumables/labor used to compute margin — not shown to customers.">
            <Input type="number" min="0" step="0.01" value={formValues.cost} onChange={(e) => setFormValues({ ...formValues, cost: e.target.value })} placeholder="0.00" />
          </Field>
          <Field label="Status">
            <div className="flex items-center gap-1 bg-surface rounded-lg p-1 w-fit">
              {([true, false] as const).map((v) => (
                <button key={String(v)} type="button" onClick={() => setFormValues({ ...formValues, is_active: v })}
                  style={formValues.is_active === v ? { backgroundColor: SVC_COLOR } : {}}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${formValues.is_active === v ? "text-white" : "text-muted hover:text-foreground"}`}>
                  {v ? "Active" : "Inactive"}
                </button>
              ))}
            </div>
          </Field>
          <FormFooter
            submitLabel={(createService.isPending || updateService.isPending) ? "Saving…" : editing ? "Save Changes" : "Add Service"}
            onCancel={() => setShowForm(false)}
            disabled={createService.isPending || updateService.isPending || !formValues.name.trim()}
            color={SVC_COLOR}
          />
        </form>
      </Drawer>

      <Drawer
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Service"
        description="This action cannot be undone."
        side="center"
        size="sm"
        footer={
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)} className="flex-1 rounded-lg text-[13px]">
              Cancel
            </Button>
            <Button type="button" variant="danger" onClick={confirmDelete} className="flex-1 rounded-lg text-[13px] font-bold">
              Delete
            </Button>
          </div>
        }
      >
        <div className="p-5">
          <p className="text-sm text-foreground/70">
            Are you sure you want to delete <span className="font-semibold text-foreground">&quot;{deleteTarget?.name}&quot;</span>? This will remove it from your service catalog.
          </p>
        </div>
      </Drawer>

      <CategoriesDrawer open={showCategories} onClose={() => setShowCategories(false)} color={SVC_COLOR} />
      <ImportServiceTemplatesModal open={showImport} onClose={() => setShowImport(false)} color={SVC_COLOR} />
    </div>
  );
}

function CategoriesDrawer({ open, onClose, color }: { open: boolean; onClose: () => void; color: string }) {
  const { data, isLoading } = useServiceCategories();
  const createCategory = useCreateServiceCategory();
  const updateCategory = useUpdateServiceCategory();
  const deleteCategory = useDeleteServiceCategory();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const categories = data?.items ?? [];
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function handleAdd() {
    if (!newName.trim() || createCategory.isPending) return;
    await createCategory.mutateAsync({ name: newName.trim() });
    setNewName("");
    setAdding(false);
  }

  async function handleEdit(id: string) {
    if (!editName.trim() || updateCategory.isPending) return;
    await updateCategory.mutateAsync({ id, data: { name: editName.trim() } });
    setEditingId(null);
  }

  function handleDelete(id: string, name: string) {
    confirm({
      title: "Delete Category",
      message: `Delete "${name}"? Services in this category will become uncategorized.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => deleteCategory.mutate(id),
    });
  }

  return (
    <Drawer open={open} onClose={onClose} title="Service Categories" description="Group services in your catalog">
      {confirmDialog}
      <div className="p-5 space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <>
            {categories.map((c) => (
              <div key={c.id} className="flex items-center gap-2 border border-border rounded-lg px-3 py-2.5">
                {editingId === c.id ? (
                  <>
                    <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleEdit(c.id)}
                      className="flex-1 px-2 py-1 border border-border rounded-md text-sm outline-none focus:border-foreground/30" />
                    <button onClick={() => handleEdit(c.id)} className="text-emerald-600 hover:bg-emerald-50 rounded-md p-1"><Check size={14} /></button>
                    <button onClick={() => setEditingId(null)} className="text-muted hover:bg-surface rounded-md p-1"><X size={14} /></button>
                  </>
                ) : (
                  <>
                    <Layers size={14} className="text-muted flex-shrink-0" />
                    <span className="flex-1 text-sm font-medium text-foreground">{c.name}</span>
                    <button onClick={() => { setEditingId(c.id); setEditName(c.name); }} className="text-muted hover:text-foreground rounded-md p-1"><Edit2 size={13} /></button>
                    <button onClick={() => handleDelete(c.id, c.name)} className="text-muted hover:text-red-500 rounded-md p-1"><Trash2 size={13} /></button>
                  </>
                )}
              </div>
            ))}
            {categories.length === 0 && !adding && (
              <p className="text-sm text-muted text-center py-6">No categories yet.</p>
            )}
          </>
        )}

        {adding ? (
          <div className="flex items-center gap-2">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="Category name" className="flex-1 px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-foreground/30" />
            <Button size="sm" onClick={handleAdd} disabled={createCategory.isPending || !newName.trim()} color={color} className="rounded-lg">Save</Button>
            <Button size="sm" type="button" variant="secondary" onClick={() => { setAdding(false); setNewName(""); }} className="rounded-lg">Cancel</Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)} className="w-full rounded-lg justify-center">
            <Plus size={14} /> Add Category
          </Button>
        )}
      </div>
    </Drawer>
  );
}
