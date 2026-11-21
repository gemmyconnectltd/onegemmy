import { redirect } from "next/navigation";

// Purchase reports live under Business reports → Purchases.
export default function Page() { redirect("/reports/purchases"); }
