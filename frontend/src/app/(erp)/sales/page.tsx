import { redirect } from "next/navigation";

// The sales overview now lives under Reports; this module opens on its first working page.
export default function SalesHome() {
  redirect("/sales/orders");
}
