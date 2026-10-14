import { request, qs } from "./client";
import type { SingleResponse } from "./types";

// Platform-level AI controls only (provider status, on/off, plan limits, usage). The chat assistant itself belongs to the customer app.

export interface AiAdminSettings {
  enabled: boolean;
  default_monthly_limit: number;
  plan_limits: Record<string, number>;
  /** Read-only: the provider and key are deployment configuration. */
  provider: { configured: string; active: string; model: string; key_present: boolean };
}

export interface AiAdminUsage {
  days: number;
  requests: number;
  errors: number;
  blocked: number;
  tokens: number;
  est_cost_usd: number;
  avg_latency_ms: number;
  top_tenants: { tenant_id: string | null; name: string; requests: number; est_cost_usd: number }[];
  recent_errors: { at: string; provider: string; error: string | null }[];
}

export const aiApi = {
  adminSettings: () => request<SingleResponse<AiAdminSettings>>("/admin/ai/settings"),
  updateAdminSettings: (data: { enabled?: boolean; default_monthly_limit?: number; plan_limits?: Record<string, number> }) =>
    request<SingleResponse<AiAdminSettings>>("/admin/ai/settings", { method: "PUT", body: JSON.stringify(data) }),
  adminUsage: (days = 30) => request<SingleResponse<AiAdminUsage>>(`/admin/ai/usage${qs({ days })}`),
};
