import type { LucideIcon } from "lucide-react";
import {
  ShoppingCart, Package, Truck, Receipt, HandCoins, Users, Calculator, ChartNoAxesCombined,
  CalendarDays, Factory, UserRoundCog, Building2, Store, Utensils, Pill, Boxes, Wrench,
  ShoppingBasket, Car, Monitor, Hotel, ArrowUpRight, CreditCard, MapPin, BookOpen,
  LifeBuoy, ShieldCheck, FileText,
} from "lucide-react";

export interface NavigationImage {
  src: string; alt: string; kind: "screenshot" | "photo"; position?: string;
  fallback: string; fallbackAlt: string; fallbackLabel: string;
}
export interface MarketingNavItem { id: string; image?: NavigationImage; title: string; description: string; href: string; icon: LucideIcon; }
export interface MarketingNavSection { title: string; items: MarketingNavItem[]; }
export type MarketingMenu = "product" | "solutions" | "resources";

const previewFallback = {
  fallback: "/screenshots/reports-menu-current.webp",
  fallbackAlt: "Cropped Pesaa reporting interface with all business data redacted",
  fallbackLabel: "Redacted reporting interface",
} as const;

// Public destinations only. These are shared by desktop disclosures and mobile accordions.
export const products: MarketingNavItem[] = [
  { id: "product-pos", image: {"src": "/screenshots/pos-menu-current.webp", "alt": "Pesaa point of sale with a product cart and payment options; data redacted", "kind": "screenshot", ...previewFallback}, title: "Point of Sale", description: "Record sales, take payments and issue receipts.", href: "/products/pos", icon: ShoppingCart },
  { id: "product-inventory", image: {"src": "/screenshots/inventory-menu-current.webp", "alt": "Pesaa inventory overview with product stock and valuation; data redacted", "kind": "screenshot", ...previewFallback}, title: "Inventory", description: "Manage products, stock levels and movements.", href: "/products/inventory", icon: Package },
  { id: "product-purchases", image: {"src": "/screenshots/purchases-menu-current.webp", "alt": "Pesaa purchases overview with suppliers and purchase activity; data redacted", "kind": "screenshot", ...previewFallback}, title: "Purchases", description: "Keep suppliers, purchasing and restocking together.", href: "/products/purchases", icon: Truck },
  { id: "product-expenses", image: {"src": "/screenshots/expenses-menu-current.webp", "alt": "Pesaa expense list with identifying fields redacted", "kind": "screenshot", ...previewFallback}, title: "Expense Management", description: "Record and organize business expenses.", href: "/products/expenses", icon: Receipt },
  { id: "product-debts", image: {"src": "/screenshots/debts-menu-current.webp", "alt": "Pesaa debt overview showing customer and supplier balances; data redacted", "kind": "screenshot", ...previewFallback}, title: "Debt Management", description: "Track customer debts and supplier balances.", href: "/products/debts", icon: HandCoins },
  { id: "product-customers", image: {"src": "/screenshots/customers-menu-current.webp", "alt": "Pesaa customer directory with personal fields redacted", "kind": "screenshot", ...previewFallback}, title: "Customers", description: "Keep customer details and sales history together.", href: "/products/customers", icon: Users },
  { id: "product-accounting", image: {"src": "/screenshots/accounting-menu-current.webp", "alt": "Pesaa accounting overview and financial activity; data redacted", "kind": "screenshot", ...previewFallback}, title: "Accounting", description: "Organize financial records and transactions.", href: "/products/accounting", icon: Calculator },
  { id: "product-reports", image: {"src": "/screenshots/reports-menu-current.webp", "alt": "Pesaa daily branch report with sales, collections and expenses; data redacted", "kind": "screenshot", ...previewFallback}, title: "Reports & Insights", description: "See business performance and financial trends.", href: "/products/reports", icon: ChartNoAxesCombined },
  { id: "product-services", image: {"src": "/screenshots/services-menu-current.webp", "alt": "Pesaa service catalog with identifying fields redacted", "kind": "screenshot", ...previewFallback}, title: "Services", description: "Manage appointments, walk-ins and service delivery.", href: "/products/services", icon: CalendarDays },
  { id: "product-manufacturing", image: {"src": "/screenshots/manufacturing-menu-current.webp", "alt": "Pesaa manufacturing interface with production workflows; data redacted", "kind": "screenshot", ...previewFallback}, title: "Manufacturing", description: "Track materials, production and finished goods.", href: "/products/manufacturing", icon: Factory },
  { id: "product-hr", image: {"src": "/screenshots/hr-menu-current.webp", "alt": "Pesaa staff directory with employee names and salaries redacted", "kind": "screenshot", ...previewFallback}, title: "HR & Staff", description: "Manage employees, attendance and payroll.", href: "/products/hr", icon: UserRoundCog },
  { id: "product-branches", image: {"src": "/screenshots/branches-menu-current.webp", "alt": "Pesaa branch management interface with identifying fields redacted", "kind": "screenshot", ...previewFallback}, title: "Branch Management", description: "Connect business locations in one account.", href: "/products/branches", icon: Building2 },
];
export const industries: MarketingNavItem[] = [
  { id: "industry-retail", image: {"src": "/marketing/shop-owner.webp", "alt": "Illustrative retail business owner using a tablet", "kind": "photo", "position": "50% 35%", ...previewFallback}, title: "Retail Stores", description: "Connect checkout, products and daily sales.", href: "/industries/retail", icon: Store },
  { id: "industry-restaurants", image: { src: "/marketing/cafe-owner.webp", alt: "Illustrative café owner preparing food behind a counter", kind: "photo", position: "50% 35%", ...previewFallback }, title: "Restaurants & Cafés", description: "Handle sales, payments and daily expenses.", href: "/industries/restaurants", icon: Utensils },
  { id: "industry-pharmacies", image: {"src": "/marketing/pharmacy-owner.webp", "alt": "Illustrative pharmacist using a tablet in a pharmacy", "kind": "photo", "position": "50% 35%", ...previewFallback}, title: "Pharmacies", description: "Track product batches and expiry dates.", href: "/industries/pharmacies", icon: Pill },
  { id: "industry-wholesale", image: {"src": "/marketing/wholesale-owner.webp", "alt": "Illustrative wholesale merchant reviewing a tablet beside stock", "kind": "photo", "position": "50% 35%", ...previewFallback}, title: "Wholesale", description: "Manage bulk sales, purchasing and customer credit.", href: "/industries/wholesale", icon: Boxes },
  { id: "industry-service-businesses", image: {"src": "/marketing/service-owner.webp", "alt": "Illustrative service business owner at a salon reception", "kind": "photo", "position": "50% 35%", ...previewFallback}, title: "Service Businesses", description: "Organize bookings, staff and service delivery.", href: "/industries/service-businesses", icon: CalendarDays },
  { id: "industry-hardware", image: { src: "/marketing/wholesale-owner.webp", alt: "Illustrative wholesale merchant reviewing stock", kind: "photo", position: "50% 35%", ...previewFallback }, title: "Hardware & Building Materials", description: "Keep product stock and supplier purchases organized.", href: "/industries/hardware", icon: Wrench },
  { id: "industry-supermarkets", image: {"src": "/marketing/shop-owner.webp", "alt": "Illustrative grocery shop owner managing her business", "kind": "photo", "position": "50% 35%", ...previewFallback}, title: "Supermarkets & Minimarts", description: "Speed up checkout and monitor product stock.", href: "/industries/supermarkets", icon: ShoppingBasket },
  { id: "industry-automotive", image: { src: "/marketing/wholesale-owner.webp", alt: "Illustrative merchant managing product stock", kind: "photo", position: "50% 35%", ...previewFallback }, title: "Automotive", description: "Manage parts inventory, purchases and sales.", href: "/industries/automotive", icon: Car },
  { id: "industry-electronics", image: { src: "/marketing/shop-owner.webp", alt: "Illustrative shop owner managing her business", kind: "photo", position: "50% 35%", ...previewFallback }, title: "Electronics & Appliances", description: "Track variants, serial numbers and product sales.", href: "/industries/electronics", icon: Monitor },
  { id: "industry-manufacturing", image: { src: "/marketing/wholesale-owner.webp", alt: "Illustrative business owner reviewing stock", kind: "photo", position: "50% 35%", ...previewFallback }, title: "Manufacturing", description: "Connect raw materials, work orders and output.", href: "/industries/manufacturing", icon: Factory },
  { id: "industry-hospitality", image: { src: "/marketing/cafe-owner.webp", alt: "Illustrative café owner at work", kind: "photo", position: "50% 35%", ...previewFallback }, title: "Hospitality", description: "Organize sales, staff and operating expenses.", href: "/industries/hospitality", icon: Hotel },
  { id: "industry-other", image: {"src": "/marketing/business-owner-banner.webp", "alt": "Illustrative business owner standing in a shop", "kind": "photo", "position": "50% 35%", ...previewFallback}, title: "Other Businesses", description: "Find the modules that fit your operations.", href: "/industries/other", icon: ArrowUpRight },
];
export const businessNeeds: MarketingNavItem[] = [
  { id: "need-payments", image: {"src": "/screenshots/pos-menu-current.webp", "alt": "Pesaa point of sale with a product cart and payment options; data redacted", "kind": "screenshot", ...previewFallback}, title: "Sell and get paid", description: "Make checkout and payment recording simpler.", href: "/products/pos", icon: CreditCard },
  { id: "need-inventory", image: {"src": "/screenshots/inventory-menu-current.webp", "alt": "Pesaa inventory overview with product stock and valuation; data redacted", "kind": "screenshot", ...previewFallback}, title: "Manage inventory", description: "Know your products and available stock.", href: "/products/inventory", icon: Package },
  { id: "need-expenses", image: {"src": "/screenshots/expenses-menu-current.webp", "alt": "Pesaa expense list with identifying fields redacted", "kind": "screenshot", ...previewFallback}, title: "Control expenses", description: "Keep spending organized and visible.", href: "/products/expenses", icon: Receipt },
  { id: "need-credit", image: {"src": "/screenshots/debts-menu-current.webp", "alt": "Pesaa debt overview showing customer and supplier balances; data redacted", "kind": "screenshot", ...previewFallback}, title: "Manage customer credit", description: "Follow unpaid sales and customer balances.", href: "/products/debts", icon: HandCoins },
  { id: "need-performance", image: {"src": "/screenshots/reports-menu-current.webp", "alt": "Pesaa daily branch report with sales, collections and expenses; data redacted", "kind": "screenshot", ...previewFallback}, title: "Understand business performance", description: "Turn financial records into useful reports.", href: "/products/reports", icon: ChartNoAxesCombined },
  { id: "need-locations", image: {"src": "/screenshots/branches-menu-current.webp", "alt": "Pesaa branch management interface with identifying fields redacted", "kind": "screenshot", ...previewFallback}, title: "Manage multiple locations", description: "Bring your branches into one account.", href: "/products/branches", icon: MapPin },
];
export const resources: MarketingNavItem[] = [
  { id: "resource-blog", title: "Blog & Resources", description: "Practical insights for running your business.", href: "/resources", icon: BookOpen },
  { id: "resource-guide", title: "Inventory Guide", description: "Understand stock counts and daily movements.", href: "/resources/stock-count-vs-shelf", icon: FileText },
  { id: "resource-support", title: "Contact Support", description: "Talk to the Pesaa team about your business.", href: "/contact", icon: LifeBuoy },
  { id: "resource-security", title: "Security", description: "Learn about access controls and data protection.", href: "/security", icon: ShieldCheck },
];
export const marketingMenus: { key: MarketingMenu; label: string; sections: MarketingNavSection[] }[] = [
  { key: "product", label: "Product", sections: [{ title: "Products", items: products }] },
  { key: "solutions", label: "Solutions", sections: [{ title: "By industry", items: industries }, { title: "By business need", items: businessNeeds }] },
  { key: "resources", label: "Resources", sections: [{ title: "Resources", items: resources }] },
];
