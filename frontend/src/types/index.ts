export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  category: string;
  unit: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  discount: number;
  total: number;
}

export interface Sale {
  id: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: "cash" | "mobile" | "card";
  customerId?: string;
  customerName?: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  totalPurchases: number;
  lastPurchaseAt?: string;
  createdAt: string;
}

export interface ShopSettings {
  shopName: string;
  currency: string;
  currencySymbol: string;
  phone?: string;
  address?: string;
}

export interface DashboardSummary {
  todaySales: number;
  todayExpenses: number;
  todayProfit: number;
  cashAvailable: number;
  lowStockCount: number;
  totalProducts: number;
  totalCustomers: number;
}
