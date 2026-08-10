import { request } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";

export interface ApiDepartment {
  id: string;
  name: string;
  code: string;
  description: string | null;
}

export interface ApiEmployee {
  id: string;
  tenant_id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  department_id: string | null;
  department: ApiDepartment | null;
  job_title: string | null;
  employment_status: string;
  hire_date: string | null;
  salary: number;
}

export interface EmployeeCreatePayload {
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  department_id?: string | null;
  job_title?: string | null;
  employment_status?: string;
  hire_date?: string | null;
  salary?: number;
}

export interface ApiAttendance {
  id: string;
  tenant_id: string;
  employee_id: string;
  employee: Pick<ApiEmployee, "full_name" | "employee_code" | "job_title"> | null;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
}

export interface AttendanceCreatePayload {
  employee_id: string;
  date: string;
  check_in?: string | null;
  check_out?: string | null;
  status?: string;
}

export interface ApiLeave {
  id: string;
  tenant_id: string;
  employee_id: string;
  employee: Pick<ApiEmployee, "full_name" | "employee_code"> | null;
  leave_type: string;
  from_date: string;
  to_date: string;
  days: number;
  reason: string | null;
  status: string;
}

export interface LeaveCreatePayload {
  employee_id: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  reason?: string | null;
}

export interface ApiPayroll {
  id: string;
  tenant_id: string;
  employee_id: string;
  employee: Pick<ApiEmployee, "full_name" | "job_title"> | null;
  period: string;
  base_salary: number;
  bonus: number;
  deductions: number;
  net_pay: number;
  status: string;
}

export interface PayrollCreatePayload {
  employee_id: string;
  period: string;
  base_salary: number;
  bonus?: number;
  deductions?: number;
}

export interface ApiApplicant {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  stage: string;
  applied_date: string;
}

export interface ApplicantCreatePayload {
  name: string;
  email?: string | null;
  phone?: string | null;
  position?: string | null;
  stage?: string;
  applied_date?: string | null;
}

const BASE = "/tenants/hr";

const qs = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") search.set(k, String(v));
  });
  const s = search.toString();
  return s ? `?${s}` : "";
};

const paginated = <T>(path: string) =>
  request<PaginatedResponse<T>>(path);

export const departmentsApi = {
  list: () => request<PaginatedResponse<ApiDepartment>>("/tenants/departments"),
};

export const hrApi = {
  listEmployees: (status?: string) =>
    paginated<ApiEmployee>(`${BASE}/employees${qs({ status })}`),
  createEmployee: (data: EmployeeCreatePayload) =>
    request<SingleResponse<ApiEmployee>>(`${BASE}/employees`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateEmployee: (id: string, data: Partial<EmployeeCreatePayload>) =>
    request<SingleResponse<ApiEmployee>>(`${BASE}/employees/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteEmployee: (id: string) =>
    request<SingleResponse<unknown>>(`${BASE}/employees/${id}`, { method: "DELETE" }),

  listAttendance: (status?: string) =>
    paginated<ApiAttendance>(`${BASE}/attendance${qs({ status })}`),
  createAttendance: (data: AttendanceCreatePayload) =>
    request<SingleResponse<ApiAttendance>>(`${BASE}/attendance`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateAttendance: (id: string, data: Partial<AttendanceCreatePayload>) =>
    request<SingleResponse<ApiAttendance>>(`${BASE}/attendance/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteAttendance: (id: string) =>
    request<SingleResponse<unknown>>(`${BASE}/attendance/${id}`, { method: "DELETE" }),

  listLeave: (status?: string) =>
    paginated<ApiLeave>(`${BASE}/leave${qs({ status })}`),
  createLeave: (data: LeaveCreatePayload) =>
    request<SingleResponse<ApiLeave>>(`${BASE}/leave`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  approveLeave: (id: string) =>
    request<SingleResponse<ApiLeave>>(`${BASE}/leave/${id}/approve`, { method: "POST" }),
  rejectLeave: (id: string) =>
    request<SingleResponse<ApiLeave>>(`${BASE}/leave/${id}/reject`, { method: "POST" }),
  deleteLeave: (id: string) =>
    request<SingleResponse<unknown>>(`${BASE}/leave/${id}`, { method: "DELETE" }),

  listPayroll: (period?: string, status?: string) =>
    paginated<ApiPayroll>(`${BASE}/payroll${qs({ period, status })}`),
  createPayroll: (data: PayrollCreatePayload) =>
    request<SingleResponse<ApiPayroll>>(`${BASE}/payroll`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  markPaid: (id: string) =>
    request<SingleResponse<ApiPayroll>>(`${BASE}/payroll/${id}/paid`, { method: "POST" }),
  deletePayroll: (id: string) =>
    request<SingleResponse<unknown>>(`${BASE}/payroll/${id}`, { method: "DELETE" }),

  listApplicants: (stage?: string) =>
    paginated<ApiApplicant>(`${BASE}/applicants${qs({ stage })}`),
  createApplicant: (data: ApplicantCreatePayload) =>
    request<SingleResponse<ApiApplicant>>(`${BASE}/applicants`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateApplicant: (id: string, data: Partial<ApplicantCreatePayload>) =>
    request<SingleResponse<ApiApplicant>>(`${BASE}/applicants/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteApplicant: (id: string) =>
    request<SingleResponse<unknown>>(`${BASE}/applicants/${id}`, { method: "DELETE" }),
};
