import { redirect } from "next/navigation";

// Operations was split into Stock, Customers and Purchases.
export default function Page() { redirect("/reports/stock"); }
