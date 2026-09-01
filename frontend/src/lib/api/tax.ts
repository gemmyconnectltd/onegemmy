import { request } from "./client";
import type { SingleResponse, PaginatedResponse } from "./types";

// ── Tax Configuration ──────────────────────────────────────────────────────────

export interface TaxConfig {
  id: string;
  tenant_id: string;
  tax_type: string;
  name: string;
  rate: number;
  rate_type: string;
  min_threshold: number;
  max_threshold: number | null;
  description: string | null;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
}

// ── Tax Calculation ────────────────────────────────────────────────────────────

export interface TaxCalculation {
  id: string;
  tenant_id: string;
  calculation_type: string;
  reference_type: string;
  reference_id: string | null;
  period: string;
  taxable_amount: number;
  tax_rate: number;
  tax_amount: number;
  status: string;
  description: string | null;
  paid_at: string | null;
}

// ── Tax Payment ────────────────────────────────────────────────────────────────

export interface TaxPayment {
  id: string;
  tenant_id: string;
  payment_reference: string;
  tax_type: string;
  period: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  status: string;
  notes: string | null;
  confirmed_at: string | null;
}

// ── Tax Calculation Results ────────────────────────────────────────────────────

export interface PAYEResult {
  gross_salary: number;
  total_paye: number;
  net_salary: number;
  effective_rate: number;
  breakdown: Array<{
    bracket: string;
    rate: number;
    taxable_amount: number;
    tax_amount: number;
  }>;
}

export interface VATResult {
  net_amount: number;
  vat_rate: number;
  vat_amount: number;
  gross_amount: number;
  is_inclusive: boolean;
}

export interface WithholdingResult {
  gross_amount: number;
  payment_type: string;
  withholding_rate: number;
  withholding_amount: number;
  net_payment: number;
}

export interface PensionResult {
  gross_salary: number;
  employee_rate: number;
  employer_rate: number;
  employee_contribution: number;
  employer_contribution: number;
  total_contribution: number;
}

export interface CorporateTaxResult {
  taxable_income: number;
  tax_rate: number;
  tax_amount: number;
  net_income: number;
}

export interface ConsumptionTaxResult {
  base_amount: number;
  is_import: boolean;
  tax_rate: number;
  tax_amount: number;
  total_with_tax: number;
}

export interface TaxSummary {
  period: string;
  taxes: Record<string, {
    total_taxable: number;
    total_tax: number;
    count: number;
  }>;
  total_tax: number;
}

export interface RwandaTaxRates {
  vat: number;
  paye: Array<{
    min: number;
    max: number | null;
    rate: number;
    description: string;
  }>;
  withholding_resident: number;
  withholding_public_institution: number;
  withholding_imports: number;
  corporate_income_tax: number;
  pension_employee: number;
  pension_employer: number;
}

const BASE = "/tenants/accounting/tax";

export const taxApi = {
  // ── Tax Rates ─────────────────────────────────────────────────────────────
  getRwandaTaxRates: () =>
    request<SingleResponse<RwandaTaxRates>>(`${BASE}/rates`),

  // ── Tax Calculators ───────────────────────────────────────────────────────
  calculatePAYE: (salary: number) =>
    request<SingleResponse<PAYEResult>>(`${BASE}/calculate/paye`, {
      method: "POST",
      body: JSON.stringify({ salary }),
    }),

  calculateVAT: (amount: number, inclusive: boolean = true) =>
    request<SingleResponse<VATResult>>(`${BASE}/calculate/vat`, {
      method: "POST",
      body: JSON.stringify({ amount, inclusive }),
    }),

  calculateWithholding: (amount: number, paymentType: string = "resident") =>
    request<SingleResponse<WithholdingResult>>(`${BASE}/calculate/withholding`, {
      method: "POST",
      body: JSON.stringify({ amount, payment_type: paymentType }),
    }),

  calculatePension: (salary: number) =>
    request<SingleResponse<PensionResult>>(`${BASE}/calculate/pension`, {
      method: "POST",
      body: JSON.stringify({ salary }),
    }),

  calculateCorporateTax: (taxableIncome: number) =>
    request<SingleResponse<CorporateTaxResult>>(`${BASE}/calculate/corporate`, {
      method: "POST",
      body: JSON.stringify({ taxable_income: taxableIncome }),
    }),

  calculateConsumptionTax: (amount: number, isImport: boolean = false) =>
    request<SingleResponse<ConsumptionTaxResult>>(`${BASE}/calculate/consumption`, {
      method: "POST",
      body: JSON.stringify({ amount, is_import: isImport }),
    }),

  // ── Tax Configurations ────────────────────────────────────────────────────
  listConfigs: () =>
    request<PaginatedResponse<TaxConfig>>(`${BASE}/configs`),

  createConfig: (data: Partial<TaxConfig>) =>
    request<SingleResponse<TaxConfig>>(`${BASE}/configs`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateConfig: (id: string, data: Partial<TaxConfig>) =>
    request<SingleResponse<TaxConfig>>(`${BASE}/configs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  // ── Tax Calculations ──────────────────────────────────────────────────────
  listCalculations: (taxType?: string, period?: string, status?: string) => {
    const params = new URLSearchParams();
    if (taxType) params.set("tax_type", taxType);
    if (period) params.set("period", period);
    if (status) params.set("status", status);
    const query = params.toString();
    return request<PaginatedResponse<TaxCalculation>>(`${BASE}/calculations${query ? `?${query}` : ""}`);
  },

  createCalculation: (data: Partial<TaxCalculation>) =>
    request<SingleResponse<TaxCalculation>>(`${BASE}/calculations`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getSummary: (period: string) =>
    request<SingleResponse<TaxSummary>>(`${BASE}/summary/${period}`),

  // ── Tax Payments ──────────────────────────────────────────────────────────
  listPayments: (taxType?: string, period?: string) => {
    const params = new URLSearchParams();
    if (taxType) params.set("tax_type", taxType);
    if (period) params.set("period", period);
    const query = params.toString();
    return request<PaginatedResponse<TaxPayment>>(`${BASE}/payments${query ? `?${query}` : ""}`);
  },

  createPayment: (data: Partial<TaxPayment>) =>
    request<SingleResponse<TaxPayment>>(`${BASE}/payments`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
