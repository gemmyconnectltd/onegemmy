import { redirect } from "next/navigation";

// The inventory overview now lives under Reports; this module opens on its first working page.
export default function InventoryHome() {
  redirect("/inventory/products");
}
