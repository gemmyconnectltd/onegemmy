// TanStack Query hooks for the Marketing Hub. Any mutation refreshes every marketing query: the lists are small and this
// keeps counts, statuses and the overview consistent without hand-written invalidation per screen.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { marketingApi as api, type ContactFilters } from "@/lib/api";

export const MARKETING_KEY = ["marketing"] as const;
type Range = { from?: string; to?: string };
const key = (...parts: unknown[]) => [...MARKETING_KEY, ...parts];

export const useMarketingOverview = (r: Range, enabled = true) => useQuery({ queryKey: key("overview", r), queryFn: () => api.overview(r).then((x) => x.data), enabled, placeholderData: keepPreviousData });
export const useMarketingAnalytics = (r: Range, enabled = true) => useQuery({ queryKey: key("analytics", r), queryFn: () => api.analytics(r).then((x) => x.data), enabled, placeholderData: keepPreviousData });
export const useContacts = (page: number, size: number, f: ContactFilters, sort: string, dir: string) =>
  useQuery({ queryKey: key("contacts", page, size, f, sort, dir), queryFn: () => api.contacts(page, size, f, sort, dir).then((x) => x.data), placeholderData: keepPreviousData });
export const useContactOptions = () => useQuery({ queryKey: key("contact-options"), queryFn: () => api.contactOptions().then((x) => x.data), staleTime: 60_000 });
export const useAudienceSummary = (f: ContactFilters, newsletter = false, enabled = true) =>
  useQuery({ queryKey: key("summary", f, newsletter), queryFn: () => api.summary(f, newsletter).then((x) => x.data), enabled, placeholderData: keepPreviousData });
export const useContactProfile = (id: string | null) => useQuery({ queryKey: key("contact", id), queryFn: () => api.contact(id!).then((x) => x.data), enabled: !!id });
export const useSegments = () => useQuery({ queryKey: key("segments"), queryFn: () => api.segments().then((x) => x.data) });
export const useTemplates = (q: { q?: string; category?: string; status?: string }) => useQuery({ queryKey: key("templates", q), queryFn: () => api.templates(q).then((x) => x.data), placeholderData: keepPreviousData });
export const useTemplate = (id: string | null) => useQuery({ queryKey: key("template", id), queryFn: () => api.template(id!).then((x) => x.data), enabled: !!id });
export const useCampaigns = (q: { kind?: string; status?: string; q?: string; parent_id?: string; page?: number; page_size?: number }, refetchInterval?: number) =>
  useQuery({ queryKey: key("campaigns", q), queryFn: () => api.campaigns(q).then((x) => x.data), placeholderData: keepPreviousData, refetchInterval });
export const useCampaign = (id: string | null, refetchInterval?: number) => useQuery({ queryKey: key("campaign", id), queryFn: () => api.campaign(id!).then((x) => x.data), enabled: !!id, refetchInterval });
export const useReadiness = (id: string | null, enabled = true) => useQuery({ queryKey: key("readiness", id), queryFn: () => api.readiness(id!).then((x) => x.data), enabled: !!id && enabled });
export const useCampaignResults = (id: string | null, refetchInterval?: number) => useQuery({ queryKey: key("results", id), queryFn: () => api.results(id!).then((x) => x.data), enabled: !!id, refetchInterval });
export const useRecipients = (id: string | null, q: { status?: string; page?: number; page_size?: number }) =>
  useQuery({ queryKey: key("recipients", id, q), queryFn: () => api.recipients(id!, q).then((x) => x.data), enabled: !!id, placeholderData: keepPreviousData });
export const useAutomations = () => useQuery({ queryKey: key("automations"), queryFn: () => api.automations().then((x) => x.data) });
export const useAutomationHistory = (id: string | null) => useQuery({ queryKey: key("automation-history", id), queryFn: () => api.automationHistory(id!).then((x) => x.data), enabled: !!id });
export const useMarketingSettings = () => useQuery({ queryKey: key("settings"), queryFn: () => api.settings().then((x) => x.data) });
export const useSuppressions = (q: { q?: string; page?: number; page_size?: number }) => useQuery({ queryKey: key("suppressions", q), queryFn: () => api.suppressions(q).then((x) => x.data), placeholderData: keepPreviousData });
export const useMarketingAudit = (q: { page?: number; page_size?: number }) => useQuery({ queryKey: key("audit", q), queryFn: () => api.audit(q).then((x) => x.data), placeholderData: keepPreviousData });

/** Runs a mutation and refreshes all marketing data. */
export function useMarketingMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: MARKETING_KEY }) });
}

export function errorText(e: unknown, fallback = "Something went wrong. Please try again."): string {
  const d = (e as { detail?: unknown })?.detail;
  return typeof d === "string" && d ? d : fallback;
}
