import { redirect } from "next/navigation";

// The accounting overview now lives under Reports; this module opens on its first working page.
export default function AccountingHome() {
  redirect("/accounting/accounts");
}
