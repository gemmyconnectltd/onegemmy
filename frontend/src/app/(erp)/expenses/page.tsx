import { redirect } from "next/navigation";

// The expenses overview now lives under Reports; this module opens on its first working page.
export default function ExpensesHome() {
  redirect("/expenses/list");
}
