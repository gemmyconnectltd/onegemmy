export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatarUrl?: string;
  role: Role;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
}

export interface Company {
  id: string;
  name: string;
  logoUrl?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  currency: string;
  ownerId: string;
  createdAt: string;
}

export interface Product {
  id: string;
  companyId: string;
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  categoryId?: string;
  price: number;
  cost?: number;
  quantity: number;
  reservedQuantity: number;
  minStock: number;
  maxStock?: number;
  reorderPoint?: number;
  unit: string;
  imageUrl?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Lead {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  companyName?: string;
  source: LeadSource;
  status: LeadStatus;
  score: number;
  assignedTo?: string;
  productInterest?: string;
  notes?: string;
  convertedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type LeadSource =
  | "website"
  | "referral"
  | "cold_call"
  | "social"
  | "ad"
  | "walk_in"
  | "other";

export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "unqualified"
  | "converted"
  | "lost";

export interface Deal {
  id: string;
  companyId: string;
  contactId: string;
  leadId?: string;
  title: string;
  value: number;
  stage: DealStage;
  probability: number;
  expectedCloseDate?: string;
  actualCloseDate?: string;
  assignedTo: string;
  lostReason?: string;
  createdAt: string;
  updatedAt: string;
}

export type DealStage =
  | "prospecting"
  | "qualification"
  | "proposal"
  | "negotiation"
  | "closed_won"
  | "closed_lost";

export interface Quote {
  id: string;
  quoteNumber: string;
  companyId: string;
  contactId: string;
  dealId?: string;
  status: QuoteStatus;
  validUntil: string;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes?: string;
  terms?: string;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type QuoteStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "accepted"
  | "rejected"
  | "expired";

export interface SalesOrder {
  id: string;
  orderNumber: string;
  companyId: string;
  contactId: string;
  quoteId?: string;
  dealId?: string;
  status: OrderStatus;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  shippingAddress?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export interface Invoice {
  id: string;
  invoiceNumber: string;
  companyId: string;
  clientId: string;
  orderId?: string;
  issuedDate: string;
  dueDate: string;
  status: InvoiceStatus;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "overdue"
  | "cancelled";

export interface Warehouse {
  id: string;
  companyId: string;
  name: string;
  code: string;
  address?: string;
  managerId?: string;
  isDefault: boolean;
  capacity?: number;
  isActive: boolean;
  createdAt: string;
}

export interface StockLevel {
  id: string;
  productId: string;
  variantId?: string;
  warehouseId: string;
  quantity: number;
  reserved: number;
  binLocation?: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  companyId: string;
  productId: string;
  warehouseId: string;
  type: "in" | "out" | "transfer" | "adjustment";
  quantity: number;
  referenceType?: string;
  referenceId?: string;
  reason?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface Employee {
  id: string;
  userId: string;
  companyId: string;
  departmentId: string;
  designation: string;
  hireDate: string;
  salary?: number;
  status: "active" | "on_leave" | "terminated";
  createdAt: string;
}

export interface Project {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  priority: Priority;
  startDate?: string;
  endDate?: string;
  budget?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type ProjectStatus =
  | "planning"
  | "in_progress"
  | "on_hold"
  | "completed"
  | "cancelled";

export type Priority = "low" | "medium" | "high" | "urgent";

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId?: string;
  dueDate?: string;
  estimatedHours?: number;
  createdAt: string;
  updatedAt: string;
}

export type TaskStatus = "todo" | "in_progress" | "review" | "done";

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  requestId: string;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{
      field: string;
      message: string;
    }>;
  };
  requestId: string;
}
