import { redirect } from "next/navigation";

// Suppliers are managed under Purchases; keep old links working.
export default function InventorySuppliersRedirect() {
  redirect("/procurement/suppliers");
}
