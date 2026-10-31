import { redirect } from "next/navigation";

// The debts overview now lives under Reports; this module opens on its first working page.
export default function DebtsHome() {
  redirect("/debts/receivables");
}
