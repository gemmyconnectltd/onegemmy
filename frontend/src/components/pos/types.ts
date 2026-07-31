export type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
  emoji: string;
  stock: number;
};

export type BusinessType = {
  id: string;
  label: string;
  icon: string;
  tagline: string;
  accent: string;
  categories: string[];
  products: Product[];
};

export type CartItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
  emoji: string;
};

export type HeldOrder = {
  id: string;
  label: string;
  time: string;
  cart: CartItem[];
  discountPercent: number;
  customerName: string;
};

export type PaymentMethod = "cash" | "mobile" | "card" | "invoice";

export type SaleResult = {
  orderId: string;
  invoiceNumber: string | null;
  isInvoice: boolean;
  payment: PaymentMethod;
  customerName: string;
  items: CartItem[];
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  tax: number;
  total: number;
  cashGiven: string;
  change: number;
  business: BusinessType;
  timestamp: Date;
};
