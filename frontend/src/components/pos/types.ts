export type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
  emoji: string;
  stock: number;
  image_url?: string | null;
  sku?: string | null;
  has_variants?: boolean;
  variants?: Variant[];
};

export type Variant = {
  id: string;
  sku?: string | null;
  attributes: Record<string, string>;
  price: number;
  stock: number;
};

export type CartItem = {
  id: string;
  product_id?: string;
  variant_id?: string | null;
  name: string;
  price: number;
  qty: number;
  emoji: string;
  discount: number;
  image_url?: string | null;
  sku?: string | null;
  variant_attributes?: Record<string, string> | null;
};

export type HeldOrder = {
  id: string;
  label: string;
  time: string;
  cart: CartItem[];
  customerName: string;
  notes: string;
};

export type PaymentMethod = "cash" | "mobile" | "card" | "invoice";

export type SaleResult = {
  orderId: string;
  invoiceNumber: string | null;
  isInvoice: boolean;
  payment: PaymentMethod;
  customerName: string;
  notes: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  cashGiven: string;
  change: number;
  timestamp: Date;
  paid?: boolean;
  paidAt?: string | null;
};
