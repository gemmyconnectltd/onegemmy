export type BusinessType = {
  id: string;
  label: string;
  icon: string;
  tagline: string;
  accent: string;
  categories: string[];
  products: Product[];
};

export type Product = {
  id: string;
  name: string;
  price: number;
  cost?: number;
  category: string;
  emoji: string;
  stock: number;
  image_url?: string | null;
  sku?: string | null;
  barcode?: string | null;
  has_variants?: boolean;
  variants?: Variant[];
};

export type Variant = {
  barcode?: string | null;
  id: string;
  sku?: string | null;
  attributes: Record<string, string>;
  price: number;
  cost?: number;
  stock: number;
};

export type CartItem = {
  id: string;
  product_id?: string;
  variant_id?: string | null;
  name: string;
  price: number;
  cost?: number;
  qty: number;
  emoji: string;
  discount: number;
  /** Cash recorded as received against this specific line, for cashiers who
   * collect payment item-by-item rather than one lump sum at the end. */
  cashReceived?: number;
  image_url?: string | null;
  sku?: string | null;
  variant_attributes?: Record<string, string> | null;
};

export type HeldOrder = {
  discountContext?: { couponCode: string; manualValue: string; manualKind: "percent" | "fixed"; discountReason: string; approvalId?: string };
  id: string;
  label: string;
  time: string;
  cart: CartItem[];
  customerName: string;
  customerId?: string | null;
  payment?: PaymentMethod;
  cashGiven?: string;
  dueDate?: string;
  notes: string;
};

export type PaymentMethod = "cash" | "mobile" | "card" | "bank";

export type SaleResult = {
  discountDetails?: { name: string; kind: string; type: string; amount: string; coupon_code?: string | null }[];
  cashierName?: string;
  orderId: string;
  /** The real backend Order id (UUID), distinct from `orderId` above (a
   *  saved order reference) — needed to download the invoice PDF.
   *  Undefined for sales saved before this field existed. */
  backendOrderId?: string;
  /** The customer on the sale, so the success screen can link to their account. */
  customerId?: string | null;
  payment: PaymentMethod;
  customerName: string;
  /** The customer's taxpayer number, printed on the receipt when recorded. */
  customerTin?: string | null;
  notes: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  /** VAT by treatment from the sale's own line snapshots; absent on sales from before line-level VAT. */
  vatBreakdown?: { treatment: string; rate: number; base: number; tax: number }[];
  /** True when VAT was added on top of the prices (VAT-exclusive pricing). */
  vatExclusive?: boolean;
  cashGiven: string;
  change: number;
  timestamp: Date;
  /** What's actually applied to the invoice — equals `total` for a normal
   * fully-paid sale, less than `total` for a partial or credit sale. */
  amountPaid?: number;
  /** total - amountPaid; > 0 means this sale left a customer receivable. */
  balanceDue?: number;
  dueDate?: string | null;
};
