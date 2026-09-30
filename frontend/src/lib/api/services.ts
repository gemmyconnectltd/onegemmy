import { request } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";
import type { ApiEmployee } from "./hr";
import type { ApiCustomer } from "./sales";
import type { ApiBranch } from "./repairs";

export interface ApiServiceCategory {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ApiService {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  price: number;
  cost: number;
  duration_minutes: number;
  image_url: string | null;
  is_active: boolean;
  category_id: string | null;
  category: ApiServiceCategory | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ApiEmployeeService {
  id: string;
  employee_id: string;
  service_id: string;
  commission_type: "percentage" | "fixed" | null;
  commission_value: number;
  duration_override_minutes: number | null;
  employee: ApiEmployee | null;
  service: ApiService | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ApiAppointmentService {
  id: string;
  service_id: string | null;
  service_name: string;
  employee_id: string | null;
  employee: ApiEmployee | null;
  duration_minutes: number;
  price: number;
}

export interface ApiAppointment {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  branch: ApiBranch | null;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer: ApiCustomer | null;
  employee_id: string | null;
  employee: ApiEmployee | null;
  status: "scheduled" | "confirmed" | "checked_in" | "in_service" | "completed" | "cancelled" | "no_show";
  scheduled_start: string;
  scheduled_end: string;
  notes: string | null;
  services: ApiAppointmentService[];
  created_at: string | null;
  updated_at: string | null;
}

export interface ApiQueueEntry {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  branch: ApiBranch | null;
  customer_id: string | null;
  customer_name: string;
  customer: ApiCustomer | null;
  service_id: string | null;
  service_name: string;
  employee_id: string | null;
  employee: ApiEmployee | null;
  status: "waiting" | "assigned" | "in_service" | "completed" | "removed";
  checked_in_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ApiServiceTemplateItem { name: string; duration_minutes: number; }
export interface ApiServiceTemplateGroup { name: string; items: ApiServiceTemplateItem[]; }
export interface ApiServiceTemplate { id: string; name: string; industry: string; groups: ApiServiceTemplateGroup[]; }
export interface ApiServiceTemplates { tenant_industry: string | null; existing: string[]; templates: ApiServiceTemplate[]; }
export interface ApiServiceImportResult { created: ApiService[]; skipped: string[]; }

const CATEGORIES = "/tenants/services/categories";
const CATALOG = "/tenants/services/catalog";
const STAFF_COMMISSIONS = "/tenants/services/staff-commissions";
const APPOINTMENTS = "/tenants/services/appointments";
const QUEUE = "/tenants/services/queue";

export const serviceCategoriesApi = {
  list: (page = 1, pageSize = 100) =>
    request<PaginatedResponse<ApiServiceCategory>>(`${CATEGORIES}?page=${page}&page_size=${pageSize}`),
  create: (data: object) =>
    request<SingleResponse<ApiServiceCategory>>(CATEGORIES, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: object) =>
    request<SingleResponse<ApiServiceCategory>>(`${CATEGORIES}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<SingleResponse<null>>(`${CATEGORIES}/${id}`, { method: "DELETE" }),
};

export const servicesApi = {
  list: (page = 1, pageSize = 20, search?: string, categoryId?: string, isActive?: boolean) => {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (search) params.set("search", search);
    if (categoryId) params.set("category_id", categoryId);
    if (isActive !== undefined) params.set("is_active", String(isActive));
    return request<PaginatedResponse<ApiService>>(`${CATALOG}?${params}`);
  },
  listAll: () => request<SingleResponse<ApiService[]>>(`${CATALOG}/all`),
  get: (id: string) => request<SingleResponse<ApiService>>(`${CATALOG}/${id}`),
  create: (data: object) =>
    request<SingleResponse<ApiService>>(CATALOG, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: object) =>
    request<SingleResponse<ApiService>>(`${CATALOG}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<SingleResponse<null>>(`${CATALOG}/${id}`, { method: "DELETE" }),
  templates: () => request<SingleResponse<ApiServiceTemplates>>(`${CATALOG}/templates`),
  import: (items: { name: string; category_name: string; duration_minutes: number }[]) =>
    request<SingleResponse<ApiServiceImportResult>>(`${CATALOG}/import`, { method: "POST", body: JSON.stringify({ items }) }),
};

export const employeeServicesApi = {
  list: () => request<SingleResponse<ApiEmployeeService[]>>(STAFF_COMMISSIONS),
  listForEmployee: (employeeId: string) =>
    request<SingleResponse<ApiEmployeeService[]>>(`${STAFF_COMMISSIONS}/employee/${employeeId}`),
  create: (data: object) =>
    request<SingleResponse<ApiEmployeeService>>(STAFF_COMMISSIONS, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: object) =>
    request<SingleResponse<ApiEmployeeService>>(`${STAFF_COMMISSIONS}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<SingleResponse<null>>(`${STAFF_COMMISSIONS}/${id}`, { method: "DELETE" }),
};

export const appointmentsApi = {
  list: (page = 1, pageSize = 20, filters?: {
    dateFrom?: string; dateTo?: string; status?: string; employeeId?: string; branchId?: string; search?: string;
  }) => {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (filters?.dateFrom) params.set("date_from", filters.dateFrom);
    if (filters?.dateTo) params.set("date_to", filters.dateTo);
    if (filters?.status) params.set("status", filters.status);
    if (filters?.employeeId) params.set("employee_id", filters.employeeId);
    if (filters?.branchId) params.set("branch_id", filters.branchId);
    if (filters?.search) params.set("search", filters.search);
    return request<PaginatedResponse<ApiAppointment>>(`${APPOINTMENTS}?${params}`);
  },
  get: (id: string) => request<SingleResponse<ApiAppointment>>(`${APPOINTMENTS}/${id}`),
  create: (data: object) =>
    request<SingleResponse<ApiAppointment>>(APPOINTMENTS, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: object) =>
    request<SingleResponse<ApiAppointment>>(`${APPOINTMENTS}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<SingleResponse<null>>(`${APPOINTMENTS}/${id}`, { method: "DELETE" }),
};

export const queueApi = {
  list: (status?: string) => {
    const params = status ? `?status=${status}` : "";
    return request<SingleResponse<ApiQueueEntry[]>>(`${QUEUE}${params}`);
  },
  create: (data: object) =>
    request<SingleResponse<ApiQueueEntry>>(QUEUE, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: object) =>
    request<SingleResponse<ApiQueueEntry>>(`${QUEUE}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<SingleResponse<null>>(`${QUEUE}/${id}`, { method: "DELETE" }),
};
