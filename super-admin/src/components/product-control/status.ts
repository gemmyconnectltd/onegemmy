import type { Tone } from "@/components/ui/Badge";
import type { FeatureAction, FeatureStatus } from "@/lib/api/admin";

export const STATUS_META: Record<FeatureStatus, { label: string; tone: Tone; effect: string }> = {
  active: { label: "Active", tone: "green", effect: "Works for every business whose plan, switches and roles allow it." },
  beta: { label: "Beta", tone: "violet", effect: "Only the businesses, branches and users in the cohort get it. Everyone else doesn't see it." },
  coming_soon: { label: "Coming soon", tone: "blue", effect: "Hidden from businesses. Nothing can be created yet." },
  maintenance: { label: "Maintenance", tone: "amber", effect: "Records stay readable; new changes are paused and your message is shown." },
  deprecated: { label: "Deprecated", tone: "red", effect: "Still works, with a retirement warning so businesses move away from it." },
  inactive: { label: "Inactive", tone: "slate", effect: "Switched off for everyone. Records stay readable; nothing new can be made." },
};

export const ACTION_META: Record<FeatureAction, { label: string; detail: string }> = {
  create: { label: "Create", detail: "Add new records" },
  edit: { label: "Edit", detail: "Change existing records" },
  delete: { label: "Delete", detail: "Remove or void records" },
  approve: { label: "Approve", detail: "Approve, reject or decide on requests" },
  import: { label: "Import", detail: "Upload records in bulk" },
  export: { label: "Export", detail: "Download records to a file" },
};

export const errorText = (e: unknown, fallback = "Could not save.") =>
  (e as { detail?: string })?.detail ?? (e as Error)?.message ?? fallback;
